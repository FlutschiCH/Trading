import time
import threading
import xml.etree.ElementTree as ET
import urllib.request
import re
from datetime import datetime
from sql_handler import SQLHandler

class NewsHandler:
    _lock = threading.RLock()
    _started = False
    _news_cache = None  # {news_id: news_dict}

    FEED_URLS = [
        {"name": "Yahoo Finance Top News", "url": "https://finance.yahoo.com/news/rssindex", "type": "news"},
        {"name": "Investing.com Forex News", "url": "https://www.investing.com/rss/news_1.rss", "type": "news"}
    ]

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._news_cache is None or force:
                cls.init_db()
                try:
                    query = "SELECT id, title, description, link, pub_date, timestamp, currency, impact, source, created_at FROM trading_news ORDER BY timestamp DESC LIMIT 300"
                    rows = SQLHandler.execute_query(query)
                    new_cache = {}
                    if isinstance(rows, list):
                        for r in rows:
                            if isinstance(r, dict):
                                new_cache[r["id"]] = dict(r)
                    cls._news_cache = new_cache
                except Exception as e:
                    print(f"[NewsHandler] Error loading news cache: {e}", flush=True)
                    if cls._news_cache is None:
                        cls._news_cache = {}

    @classmethod
    def init_db(cls):
        query = """
        CREATE TABLE IF NOT EXISTS trading_news (
            id VARCHAR(128) PRIMARY KEY,
            title VARCHAR(512) NOT NULL,
            description TEXT,
            link VARCHAR(512),
            pub_date VARCHAR(64),
            timestamp BIGINT,
            currency VARCHAR(16) DEFAULT 'ALL',
            impact VARCHAR(16) DEFAULT 'Medium',
            source VARCHAR(64) DEFAULT 'ForexFactory',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        try:
            SQLHandler.execute_query(query)
        except Exception as e:
            print(f"[NewsHandler] Error initializing trading_news table: {e}", flush=True)

    @classmethod
    def start_background_sync(cls):
        with cls._lock:
            if cls._started:
                return
            cls._started = True

        cls._ensure_cache_loaded()

        def _sync_loop():
            # Initial sync
            cls.fetch_and_store_news()
            while True:
                time.sleep(300) # 5 minutes interval
                cls.fetch_and_store_news()

        thread = threading.Thread(target=_sync_loop, daemon=True)
        thread.start()

    @classmethod
    def _parse_xml(cls, url):
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        return ET.fromstring(xml_data)

    @classmethod
    def fetch_and_store_news(cls):
        cls.init_db()
        news_items = []

        for feed in cls.FEED_URLS:
            try:
                root = cls._parse_xml(feed["url"])
                if feed["type"] == "calendar":
                    # Parse ForexFactory Calendar XML format (<event>)
                    for event in root.findall(".//event"):
                        title = event.findtext("title", "").strip()
                        country = event.findtext("country", "USD").strip()
                        date_str = event.findtext("date", "").strip()
                        time_str = event.findtext("time", "").strip()
                        impact = event.findtext("impact", "Medium").strip()
                        
                        if not title:
                            continue

                        news_id = f"ff_{country}_{date_str}_{time_str}_{hash(title)}"
                        pub_date = f"{date_str} {time_str}".strip()
                        
                        # Infer impact badge if standard wording
                        if "high" in impact.lower():
                            impact_val = "High"
                        elif "medium" in impact.lower():
                            impact_val = "Medium"
                        elif "low" in impact.lower():
                            impact_val = "Low"
                        else:
                            impact_val = "Medium"

                        news_items.append({
                            "id": news_id[:128],
                            "title": title[:512],
                            "description": f"Economic Event for {country}. Forecast: {event.findtext('forecast', 'N/A')}, Previous: {event.findtext('previous', 'N/A')}",
                            "link": "https://www.forexfactory.com/calendar",
                            "pub_date": pub_date[:64],
                            "timestamp": int(time.time()),
                            "currency": country.upper() if country else "ALL",
                            "impact": impact_val,
                            "source": feed["name"]
                        })

                else:
                    # Standard RSS (<item>)
                    for item in root.findall(".//item"):
                        title = item.findtext("title", "").strip()
                        link = item.findtext("link", "").strip()
                        desc = item.findtext("description", "").strip()
                        pub_date = item.findtext("pubDate", "").strip()

                        if not title:
                            continue

                        # Clean HTML tags in description
                        clean_desc = re.sub(r'<[^>]+>', '', desc)[:500] if desc else ""
                        news_id = f"rss_{hash(title)}"
                        
                        # Detect currency in title/desc
                        detected_currency = "ALL"
                        for curr in ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"]:
                            if curr in title.upper() or curr in clean_desc.upper():
                                detected_currency = curr
                                break

                        # Detect impact keyword
                        impact_val = "Medium"
                        if any(w in title.lower() for w in ["rate hike", "fed", "inflation", "cpi", "nfp", "gdp", "war", "crisis"]):
                            impact_val = "High"
                        elif any(w in title.lower() for w in ["report", "stocks", "earnings"]):
                            impact_val = "Low"

                        news_items.append({
                            "id": news_id[:128],
                            "title": title[:512],
                            "description": clean_desc,
                            "link": link[:512],
                            "pub_date": pub_date[:64],
                            "timestamp": int(time.time()),
                            "currency": detected_currency,
                            "impact": impact_val,
                            "source": feed["name"]
                        })

            except Exception as e:
                print(f"[NewsHandler] Error fetching feed {feed['name']}: {e}", flush=True)

        # Update in-memory cache instantly
        cls._ensure_cache_loaded()
        with cls._lock:
            for item in news_items:
                cls._news_cache[item["id"]] = dict(item)

        # Upsert items into DB with ON DUPLICATE KEY UPDATE
        upsert_query = """
        INSERT INTO trading_news (id, title, description, link, pub_date, timestamp, currency, impact, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            description = VALUES(description),
            link = VALUES(link),
            pub_date = VALUES(pub_date),
            timestamp = VALUES(timestamp),
            currency = VALUES(currency),
            impact = VALUES(impact),
            source = VALUES(source)
        """

        for item in news_items:
            try:
                SQLHandler.execute_query(upsert_query, (
                    item["id"], item["title"], item["description"], item["link"],
                    item["pub_date"], item["timestamp"], item["currency"], item["impact"], item["source"]
                ))
            except Exception:
                pass

        return len(news_items)

    @classmethod
    def get_news(cls, currency=None, impact=None, search=None, limit=100):
        cls._ensure_cache_loaded()
        with cls._lock:
            items = list(cls._news_cache.values())
            filtered = []

            for item in items:
                # Filter by currency
                if currency and currency.upper() != 'ALL':
                    item_curr = str(item.get("currency", "")).upper()
                    if item_curr != "ALL" and item_curr != currency.upper():
                        continue

                # Filter by impact
                if impact and impact.upper() != 'ALL':
                    item_impact = str(item.get("impact", "")).upper()
                    if item_impact != impact.upper():
                        continue

                # Filter by search string
                if search:
                    s = search.lower()
                    title = str(item.get("title", "")).lower()
                    desc = str(item.get("description", "")).lower()
                    if s not in title and s not in desc:
                        continue

                filtered.append(dict(item))

            filtered.sort(key=lambda x: int(x.get("timestamp") or 0), reverse=True)
            return filtered[:int(limit)]
