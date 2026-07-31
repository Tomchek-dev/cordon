'use client';

import { useEffect, useState } from 'react';
import { fetchPushPublicKey, subscribePush, unsubscribePush } from '@/lib/api';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(!!existing);
    });
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await fetchPushPublicKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribePush(subscription.toJSON() as Parameters<typeof subscribePush>[0]);
      setSubscribed(true);
    } catch (err) {
      console.error('push subscribe failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await unsubscribePush(existing.endpoint);
        await existing.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('push unsubscribe failed', err);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      onClick={subscribed ? disable : enable}
      disabled={busy}
      className="w-full px-2 py-1.5 text-left text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
    >
      {subscribed ? '🔔 Notifications on' : '🔕 Enable notifications'}
    </button>
  );
}
