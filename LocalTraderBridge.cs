using System;
using System.Net;
using System.Text;
using System.Threading;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class LocalTraderBridge : Robot
    {
        private HttpListener _listener;
        private Thread _listenerThread;
        private bool _isRunning = true;

        protected override void OnStart()
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://localhost:8752/");
            _listener.Start();

            _listenerThread = new Thread(Listen);
            _listenerThread.Start();
            Print("Local cTrader Bridge started on http://localhost:8752/");
        }

        private void Listen()
        {
            while (_isRunning)
            {
                try
                {
                    HttpListenerContext context = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem((c) =>
                    {
                        var ctx = (HttpListenerContext)c;
                        ProcessRequest(ctx);
                    }, context);
                }
                catch (Exception) { }
            }
        }

        private void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;
            
            // Allow CORS
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            string responseString = "";
            response.ContentType = "application/json";

            try
            {
                if (request.Url.AbsolutePath == "/account")
                {
                    responseString = string.Format(
                        "{{\"balance\": {0}, \"equity\": {1}, \"margin\": {2}, \"margin_free\": {3}, \"currency\": \"{4}\", \"broker\": \"{5}\"}}",
                        Account.Balance, Account.Equity, Account.Margin, Account.FreeMargin, Account.Currency, Account.BrokerName
                    );
                }
                else if (request.Url.AbsolutePath == "/positions")
                {
                    StringBuilder sb = new StringBuilder();
                    sb.Append("[");
                    for (int i = 0; i < Positions.Count; i++)
                    {
                        var pos = Positions[i];
                        sb.Append(string.Format(
                            "{{\"position_id\": {0}, \"symbol\": \"{1}\", \"trade_side\": \"{2}\", \"volume\": {3}, \"entry_price\": {4}, \"unrealized_profit\": {5}}}",
                            pos.Id, pos.SymbolName, pos.TradeType.ToString(), pos.VolumeInUnits, pos.EntryPrice, pos.NetProfit
                        ));
                        if (i < Positions.Count - 1) sb.Append(",");
                    }
                    sb.Append("]");
                    responseString = sb.ToString();
                }
                else if (request.Url.AbsolutePath == "/order")
                {
                    // Execute order on local terminal
                    using (var reader = new System.IO.StreamReader(request.InputStream, request.ContentEncoding))
                    {
                        string body = reader.ReadToEnd();
                        // Parse JSON fields simply
                        string symbol = GetJsonValue(body, "symbol");
                        string side = GetJsonValue(body, "order_type");
                        double volume = double.Parse(GetJsonValue(body, "volume"));

                        TradeType tradeType = side.ToUpper() == "BUY" ? TradeType.Buy : TradeType.Sell;
                        var result = ExecuteMarketOrder(tradeType, symbol, volume, "NexusTrade");
                        
                        if (result.IsSuccessful)
                        {
                            responseString = string.Format("{{\"status\": \"success\", \"position_id\": {0}}}", result.Position.Id);
                        }
                        else
                        {
                            responseString = string.Format("{{\"status\": \"error\", \"message\": \"{0}\"}}", result.Error);
                            response.StatusCode = 400;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                responseString = "{\"error\": \"" + ex.Message + "\"}";
                response.StatusCode = 500;
            }

            byte[] buffer = Encoding.UTF8.GetBytes(responseString);
            response.ContentLength64 = buffer.Length;
            response.OutputStream.Write(buffer, 0, buffer.Length);
            response.OutputStream.Close();
        }

        private string GetJsonValue(string json, string key)
        {
            string keyPat = "\"" + key + "\":";
            int idx = json.IndexOf(keyPat);
            if (idx == -1) return "";
            int start = json.IndexOf("\"", idx + keyPat.Length);
            if (start == -1) // check if numeric
            {
                int numStart = idx + keyPat.Length;
                int numEnd = json.IndexOfAny(new char[] { ',', '}' }, numStart);
                return json.Substring(numStart, numEnd - numStart).Trim();
            }
            int end = json.IndexOf("\"", start + 1);
            return json.Substring(start + 1, end - start - 1);
        }

        protected override void OnStop()
        {
            _isRunning = false;
            try {
                _listener.Stop();
            } catch { }
            _listenerThread.Join();
        }
    }
}
