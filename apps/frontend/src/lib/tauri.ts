import { isTauri } from '@tauri-apps/api/core';

export { isTauri };

export async function sendDesktopNotification(title: string, body: string) {
  if (!isTauri()) return;
  const { isPermissionGranted, requestPermission, sendNotification } = await import(
    '@tauri-apps/plugin-notification'
  );
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === 'granted';
  }
  if (granted) {
    sendNotification({ title, body });
  }
}

export async function setDesktopUnreadCount(count: number) {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_unread_count', { count }).catch(() => {});
}
