import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bell, BellOff, MessageSquare, Send, Check, AlertTriangle, Shield, Settings, Volume2 } from 'lucide-react';
import { API_BASE_URL } from '../api';

interface NotificationSettingsViewProps {
  setView: (view: 'dashboard' | 'mappings' | 'trades' | 'computers' | 'notifications') => void;
}

export default function NotificationSettingsView({ setView }: NotificationSettingsViewProps) {
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
    checkSubscription();
  }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notification/settings`);
      const data = await res.json();
      if (data.status === 'success') {
        setDiscordWebhook(data.settings.discord_webhook_url || '');
        setDiscordEnabled(data.settings.discord_enabled);
        setPushEnabled(data.settings.push_enabled);
      }
    } catch (err) {
      console.error('Error fetching notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionState('denied');
      return;
    }
    
    setPermissionState(Notification.permission);
    
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (err) {
      console.error('Error checking push subscription:', err);
    }
  };

  const saveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/notification/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_webhook_url: discordWebhook,
          discord_enabled: discordEnabled,
          push_enabled: pushEnabled,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        showMsg('Notification configurations saved successfully!', 'success');
      } else {
        showMsg(data.message || 'Failed to save settings.', 'error');
      }
    } catch (err: any) {
      showMsg(err.message || 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper to convert base64 to Uint8Array for PushManager subscribe
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showMsg('Push notifications are not supported on this browser/device.', 'error');
      return;
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== 'granted') {
        showMsg('Notification permission denied. Please allow notifications in your site settings.', 'error');
        return;
      }

      // Fetch VAPID public key
      const keyRes = await fetch(`${API_BASE_URL}/api/notification/vapid-public-key`);
      const keyData = await keyRes.json();
      if (keyData.status !== 'success' || !keyData.public_key) {
        showMsg('Failed to fetch VAPID public key from backend.', 'error');
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(keyData.public_key);
      const reg = await navigator.serviceWorker.ready;
      
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Send subscription to backend
      const subRes = await fetch(`${API_BASE_URL}/api/notification/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      
      const subData = await subRes.json();
      if (subData.status === 'success') {
        setIsSubscribed(true);
        showMsg('Successfully subscribed to PWA Mobile push notifications!', 'success');
      } else {
        showMsg(subData.message || 'Backend failed to save subscription.', 'error');
      }
    } catch (err: any) {
      console.error('Subscription error:', err);
      showMsg(err.message || 'Error subscribing to push notifications.', 'error');
    }
  };

  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Notify backend first
        await fetch(`${API_BASE_URL}/api/notification/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      showMsg('Successfully unsubscribed from push notifications.', 'success');
    } catch (err: any) {
      showMsg(err.message || 'Error unsubscribing from push.', 'error');
    }
  };

  const triggerTestPush = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notification/test-push`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        showMsg('Test push notification dispatched!', 'success');
      } else {
        showMsg(data.message || 'Failed to trigger test push.', 'error');
      }
    } catch (err: any) {
      showMsg(err.message || 'Failed to trigger test push.', 'error');
    }
  };

  const triggerTestDiscord = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notification/test-discord`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        showMsg('Test Discord message sent!', 'success');
      } else {
        showMsg(data.message || 'Failed to send test Discord message.', 'error');
      }
    } catch (err: any) {
      showMsg(err.message || 'Failed to send test Discord message.', 'error');
    }
  };

  const triggerLocalSound = () => {
    // Play local default beep or test sound
    const audio = new Audio('/favicon.svg'); // dummy check, we can trigger backend route
    fetch(`${API_BASE_URL}/api/notification/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "Test Alert", sound_type: "trade_open" })
    });
    showMsg('Local sound notification triggered!', 'success');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: 'var(--app-text)' }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px', color: 'var(--app-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => setView('dashboard')}
          style={{
            backgroundColor: 'var(--app-panel-header-bg)',
            border: '1px solid var(--app-card-border)',
            borderRadius: '8px',
            padding: '8px',
            color: 'var(--app-text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>🔔 Notification Settings</h1>
          <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', margin: '4px 0 0 0' }}>
            Configure Web Push alerts for mobile devices and Discord channel notifications.
          </p>
        </div>
      </div>

      {message && (
        <div style={{
          backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
          borderRadius: '8px',
          padding: '12px 16px',
          color: message.type === 'success' ? '#10b981' : '#ef4444',
          marginBottom: '20px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {message.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* PWA Mobile / Desktop Push Section */}
        <div style={{
          backgroundColor: 'var(--app-card-bg)',
          border: '1px solid var(--app-card-border)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Shield size={20} style={{ color: '#3b82f6' }} />
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>PWA Mobile & Browser Push</h2>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
            Receive real-time push alerts directly on your iOS / Android home-screen app or desktop browser when trading signals occur.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(30, 41, 59, 0.3)', padding: '12px', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '12px', display: 'block', fontWeight: 'bold' }}>Status</span>
                <span style={{ fontSize: '13px', color: isSubscribed ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                  {isSubscribed ? '● Active Subscription' : '○ Not Subscribed'}
                </span>
              </div>
              
              <div>
                {isSubscribed ? (
                  <button
                    onClick={unsubscribePush}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    Unsubscribe
                  </button>
                ) : (
                  <button
                    onClick={subscribePush}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    }}
                  >
                    Subscribe Now
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => {
                    setPushEnabled(e.target.checked);
                    // Autosave changes
                    setTimeout(() => saveSettings(), 50);
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px' }}>Enable Web Push Notifications Globally</span>
              </label>

              {isSubscribed && (
                <button
                  onClick={triggerTestPush}
                  style={{
                    backgroundColor: 'var(--app-panel-header-bg)',
                    border: '1px solid var(--app-card-border)',
                    color: 'var(--app-text)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Send size={10} /> Test Push
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Discord Webhook Section */}
        <form onSubmit={saveSettings} style={{
          backgroundColor: 'var(--app-card-bg)',
          border: '1px solid var(--app-card-border)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <MessageSquare size={20} style={{ color: '#5865F2' }} />
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>Discord Channel Integration</h2>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
            Deliver trade execution details and signal alerts straight to your Discord channel via Webhook.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--app-text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Discord Webhook URL
              </label>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--app-input-bg)',
                  border: '1px solid var(--app-input-border)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: 'var(--app-input-text)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={discordEnabled}
                  onChange={(e) => setDiscordEnabled(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px' }}>Enable Discord Alerts</span>
              </label>

              {discordWebhook.trim().startsWith('https://') && (
                <button
                  type="button"
                  onClick={triggerTestDiscord}
                  style={{
                    backgroundColor: 'var(--app-panel-header-bg)',
                    border: '1px solid var(--app-card-border)',
                    color: 'var(--app-text)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Send size={10} /> Test Discord
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Discord Settings'}
          </button>
        </form>

        {/* Local Auditory Alerts */}
        <div style={{
          backgroundColor: 'var(--app-card-bg)',
          border: '1px solid var(--app-card-border)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Volume2 size={20} style={{ color: '#10b981' }} />
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>System Audio Sound</h2>
          </div>
          
          <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', lineHeight: '1.5', marginBottom: '16px' }}>
            Test server-side Windows audio beeps and dashboard startup sound.
          </p>

          <button
            onClick={triggerLocalSound}
            style={{
              backgroundColor: 'var(--app-panel-header-bg)',
              border: '1px solid var(--app-card-border)',
              color: 'var(--app-text)',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔔 Test Local Notification
          </button>
        </div>

      </div>
    </div>
  );
}
