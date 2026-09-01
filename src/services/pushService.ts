import { API_BASE_URL } from '../api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerWebPushSubscription() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[WebPush] Push notifications not supported in this browser.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existingSub = await reg.pushManager.getSubscription();

    // If notification permission is already granted, ensure we are subscribed & registered on backend
    if (Notification.permission === 'granted') {
      await subscribeAndSend(reg);
      return;
    }

    // If permission is default (not yet prompted), request permission on user interaction or start
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await subscribeAndSend(reg);
      }
    }
  } catch (err) {
    console.error('[WebPush] Error during web push auto-registration:', err);
  }
}

async function subscribeAndSend(reg: ServiceWorkerRegistration) {
  try {
    const keyRes = await fetch(`${API_BASE_URL}/api/notification/vapid-public-key`);
    const keyData = await keyRes.json();
    if (keyData.status !== 'success' || !keyData.public_key) {
      console.warn('[WebPush] Could not fetch VAPID public key from backend');
      return;
    }

    const applicationServerKey = urlBase64ToUint8Array(keyData.public_key);
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });
    }

    await fetch(`${API_BASE_URL}/api/notification/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    console.log('[WebPush] Auto-registered push notification subscription successfully');
  } catch (err) {
    console.error('[WebPush] Failed to subscribe and send subscription to backend:', err);
  }
}
