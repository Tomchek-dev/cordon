const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY';
export type UserRole = 'ADMIN' | 'MOD' | 'MEMBER';

export interface User {
  id: string;
  username: string;
  displayName: string;
  status: PresenceStatus;
  avatar: string | null;
  role: UserRole;
  notifyDmOnly?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'TEXT' | 'VOICE' | 'DM';
  isPrivate: boolean;
  createdAt: string;
  unreadCount: number;
  muted: boolean;
  dmParticipant: Pick<User, 'id' | 'username' | 'displayName' | 'status' | 'avatar'> | null;
}

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string | null;
  botId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: MessageAuthor | null;
  bot: { id: string; name: string } | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
}

export interface Bot {
  id: string;
  name: string;
  webhookUrl: string | null;
  permissions: string[];
  ownerId: string;
  createdAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? 'Request failed');
  }

  return res.json();
}

export function register(username: string, displayName: string, password: string) {
  return request<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, displayName, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function fetchChannels() {
  return request<Channel[]>('/channels');
}

export function createChannel(
  name: string,
  type: 'TEXT' | 'VOICE' = 'TEXT',
  isPrivate = false,
  memberIds: string[] = [],
) {
  return request<Channel>('/channels', {
    method: 'POST',
    body: JSON.stringify({ name, type, isPrivate, memberIds }),
  });
}

export function addChannelMember(channelId: string, userId: string) {
  return request<{ ok: true }>(`/channels/${channelId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export interface VoiceToken {
  token: string;
  wsUrl: string;
  roomName: string;
}

export function fetchVoiceToken(channelId: string) {
  return request<VoiceToken>(`/channels/${channelId}/voice-token`, {
    method: 'POST',
  });
}

export function fetchMessages(channelId: string) {
  return request<ChatMessage[]>(`/channels/${channelId}/messages`);
}

export function fetchUsers() {
  return request<User[]>('/users');
}

export function createDm(userId: string) {
  return request<Channel>('/channels/dm', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function setUserRole(userId: string, role: UserRole) {
  return request<User>(`/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  return request<{ id: string; username: string; displayName: string; avatar: string }>(
    '/users/me/avatar',
    { method: 'POST', body: form },
  );
}

export function uploadAttachment(channelId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<Attachment>(`/channels/${channelId}/attachments`, {
    method: 'POST',
    body: form,
  });
}

export function fetchBots() {
  return request<Bot[]>('/bots');
}

export function createBot(name: string, webhookUrl?: string) {
  return request<Bot & { token: string }>('/bots', {
    method: 'POST',
    body: JSON.stringify({ name, webhookUrl: webhookUrl || undefined }),
  });
}

export function updateBot(id: string, webhookUrl: string) {
  return request<Bot>(`/bots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ webhookUrl }),
  });
}

export function deleteBot(id: string) {
  return request<{ ok: boolean }>(`/bots/${id}`, { method: 'DELETE' });
}

export function setChannelMuted(channelId: string, muted: boolean) {
  return request<{ muted: boolean }>(`/channels/${channelId}/mute`, {
    method: 'PATCH',
    body: JSON.stringify({ muted }),
  });
}

export function setNotifyDmOnly(notifyDmOnly: boolean) {
  return request<{ id: string; notifyDmOnly: boolean }>('/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ notifyDmOnly }),
  });
}

export function fetchMe() {
  return request<User>('/users/me');
}

export interface DailyReport {
  id: string;
  date: string;
  channelId: string;
  content: string;
  generatedAt: string;
}

export function fetchReports() {
  return request<DailyReport[]>('/reports');
}

export function generateReportNow() {
  return request<DailyReport>('/reports/generate', { method: 'POST' });
}

export interface SearchResult extends ChatMessage {
  channel: { id: string; name: string; type: 'TEXT' | 'VOICE' | 'DM' };
}

export function searchMessages(query: string, channelId?: string) {
  const params = new URLSearchParams({ q: query });
  if (channelId) params.set('channelId', channelId);
  return request<SearchResult[]>(`/search/messages?${params.toString()}`);
}

export function fetchPushPublicKey() {
  return request<{ publicKey: string }>('/push/public-key');
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actor: { id: string; username: string; displayName: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function fetchAuditLog() {
  return request<AuditLogEntry[]>('/audit-log');
}

export function subscribePush(sub: PushSubscriptionJSON) {
  return request<{ ok: true }>('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(sub),
  });
}

export function unsubscribePush(endpoint: string) {
  return request<{ ok: true }>('/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
