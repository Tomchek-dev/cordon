'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import {
  type Channel,
  type ChatMessage,
  type ReadReceipt,
  type PresenceStatus,
  type Role,
  type User,
  type GifResult,
  createChannel,
  createDm,
  fetchChannels,
  fetchGifsEnabled,
  fetchMe,
  fetchMessages,
  fetchPinnedMessages,
  fetchReadReceipts,
  fetchRoles,
  fetchUsers,
  setChannelMuted,
  setNotifyDmOnly,
  uploadAttachment,
  uploadAvatar,
  uploadChannelAvatar,
} from '@/lib/api';
import { decodeToken } from '@/lib/jwt';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { sendDesktopNotification, setDesktopUnreadCount } from '@/lib/tauri';
import { Avatar } from '@/components/Avatar';
import { Plus, Smile, Film, LayoutGrid, Sun, Moon } from 'lucide-react';
import { getTheme, setTheme, type Theme } from '@/lib/theme';
import { AdminDashboard } from '@/components/AdminDashboard';
import { CalendarPanel } from '@/components/CalendarPanel';
import { BotsPanel } from '@/components/BotsPanel';
import { EmojiPickerPopover } from '@/components/EmojiPickerPopover';
import { CommandsLauncherPopover } from '@/components/CommandsLauncherPopover';
import { GifPickerPopover } from '@/components/GifPickerPopover';
import { ReportsPanel } from '@/components/ReportsPanel';
import { MessageContent } from '@/components/MessageContent';
import { PushNotificationToggle } from '@/components/PushNotificationToggle';
import { SearchPanel } from '@/components/SearchPanel';
import { VoiceCallBar } from '@/components/VoiceCallBar';
import { ToastStack, type ToastItem } from '@/components/Toast';
import { formatBytes } from '@/lib/format';

const STATUS_OPTIONS: { value: 'ONLINE' | 'AWAY' | 'BUSY'; label: string }[] = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'AWAY', label: 'Away' },
  { value: 'BUSY', label: 'Busy' },
];

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceStatus>>({});

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [membersPanelOpen, setMembersPanelOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingEmitRef = useRef(0);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'TEXT' | 'VOICE'>('TEXT');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [newChannelRoleIds, setNewChannelRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [dmCallOpen, setDmCallOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [awayReasonPromptOpen, setAwayReasonPromptOpen] = useState(false);
  const [awayReasonDraft, setAwayReasonDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [botsPanelOpen, setBotsPanelOpen] = useState(false);
  const [reportsPanelOpen, setReportsPanelOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifyDmOnly, setNotifyDmOnlyState] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);
  const [gifsEnabled, setGifsEnabled] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null);
  // Keeps socket listeners (registered once) aware of the currently active channel.
  const activeChannelIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  // Lets the 'notification' socket listener (registered once) look up a
  // channel's display name without a stale closure over `channels`.
  const channelsRef = useRef<Channel[]>([]);
  // Tracks an explicit Away/Busy choice so the automatic tab-visibility switch
  // (below) doesn't silently override it back to Online.
  const manualStatusRef = useRef<'AWAY' | 'BUSY' | null>(null);

  useEffect(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'));
    if (saved >= 240 && saved <= 560) {
      setSidebarWidth(saved);
    }
    setThemeState(getTheme());
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    function handleMouseMove(moveEvent: MouseEvent) {
      const next = Math.min(560, Math.max(240, moveEvent.clientX));
      setSidebarWidth(next);
    }
    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setSidebarWidth((current) => {
        localStorage.setItem('sidebarWidth', String(current));
        return current;
      });
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const decoded = decodeToken(token);
    setCurrentUserId(decoded?.sub ?? null);
    currentUserIdRef.current = decoded?.sub ?? null;
    setUsername(localStorage.getItem('username'));

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('newMessage', (message: ChatMessage) => {
      if (message.channelId === activeChannelIdRef.current) {
        setMessages((prev) => [...prev, message]);
      }

      const lastMessage = {
        content: message.content,
        createdAt: message.createdAt,
        senderName: message.author?.displayName ?? message.bot?.name ?? 'System',
      };
      const bumpUnread = message.channelId !== activeChannelIdRef.current && message.authorId !== currentUserIdRef.current;

      setChannels((prev) => {
        if (!prev.some((c) => c.id === message.channelId)) {
          // First message on a channel we don't know about yet (e.g. someone just
          // opened a DM with us) - refetch the list instead of guessing its shape.
          fetchChannels().then(setChannels);
          return prev;
        }
        return prev.map((c) =>
          c.id === message.channelId
            ? { ...c, lastMessage, unreadCount: bumpUnread ? c.unreadCount + 1 : c.unreadCount }
            : c,
        );
      });
    });

    socket.on('messageUpdated', (message: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    });

    socket.on('messageDeleted', ({ id }: { id: string; channelId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on('presence', ({ userId, status }: { userId: string; status: PresenceStatus }) => {
      setPresence((prev) => ({ ...prev, [userId]: status }));
      // A presence update for a user we don't know about yet means someone new
      // registered after our initial load — refresh the member list to pick them up.
      setUsers((prev) => {
        if (prev.some((u) => u.id === userId)) return prev;
        fetchUsers().then(setUsers);
        return prev;
      });
    });

    socket.on('channelsChanged', () => {
      fetchChannels().then(setChannels);
    });

    socket.on('userTyping', ({ channelId, userId }: { channelId: string; userId: string }) => {
      if (channelId !== activeChannelIdRef.current) return;
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      const existing = typingTimeoutsRef.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimeoutsRef.current.set(
        userId,
        setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((id) => id !== userId));
          typingTimeoutsRef.current.delete(userId);
        }, 3000),
      );
    });

    socket.on('reactionAdded', ({ messageId, userId, emoji }: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && !m.reactions.some((r) => r.userId === userId && r.emoji === emoji)
            ? { ...m, reactions: [...m.reactions, { userId, emoji }] }
            : m,
        ),
      );
    });

    socket.on('reactionRemoved', ({ messageId, userId, emoji }: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, reactions: m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji)) }
            : m,
        ),
      );
    });

    socket.on('messagePinned', ({ messageId, pinnedAt }: { messageId: string; pinnedAt: string | null }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pinnedAt } : m)));
      if (activeChannelIdRef.current) {
        fetchPinnedMessages(activeChannelIdRef.current).then(setPinnedMessages);
      }
    });

    socket.on('read', ({ channelId, userId, lastReadAt }: { channelId: string; userId: string; lastReadAt: string }) => {
      if (channelId !== activeChannelIdRef.current) return;
      setReadReceipts((prev) => {
        const existing = prev.find((r) => r.userId === userId);
        if (!existing) return prev;
        return prev.map((r) => (r.userId === userId ? { ...r, lastReadAt } : r));
      });
    });

    socket.on(
      'notification',
      (payload: { channelId: string; preview: string; kind: 'message' | 'mention' | 'reminder' }) => {
        // Don't toast about the channel the user is already looking at.
        if (payload.channelId === activeChannelIdRef.current) return;
        const channel = channelsRef.current.find((c) => c.id === payload.channelId);
        const title = channel
          ? channel.type === 'DM'
            ? (channel.dmParticipant?.displayName ?? 'Direct message')
            : `#${channel.name}`
          : 'New activity';
        const id = `${payload.channelId}-${Date.now()}-${Math.random()}`;
        setToasts((prev) => [
          ...prev,
          { id, channelId: payload.channelId, title, preview: payload.preview, kind: payload.kind },
        ]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
        sendDesktopNotification(title, payload.preview);
      },
    );

    socket.on('error', ({ message }: { message: string }) => {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(null), 4000);
    });

    socket.on(
      'statusReason',
      ({ userId, displayName, reason }: { userId: string; displayName: string; status: string; reason: string }) => {
        if (userId === currentUserIdRef.current) return;
        setStatusToast(`🚶 ${displayName} stepped away: ${reason}`);
        setTimeout(() => setStatusToast(null), 6000);
      },
    );

    function handleVisibility() {
      // A manual Away/Busy choice sticks until the user changes it themselves.
      if (manualStatusRef.current) return;
      const next = document.hidden ? 'AWAY' : 'ONLINE';
      socket.emit('setStatus', { status: next });
      if (currentUserIdRef.current) {
        setPresence((prev) => ({ ...prev, [currentUserIdRef.current!]: next }));
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    Promise.all([fetchChannels(), fetchUsers(), fetchMe(), fetchRoles().catch(() => [])])
      .then(([channelList, userList, me, roleList]) => {
        setChannels(channelList);
        setUsers(userList);
        setRoles(roleList);
        // Merge rather than overwrite: a live 'presence' event may have already
        // arrived over the socket before this REST snapshot resolves, and it
        // should win over this potentially-stale DB read.
        setPresence((prev) => ({
          ...Object.fromEntries(userList.map((u) => [u.id, u.status])),
          ...prev,
        }));
        setNotifyDmOnlyState(me.notifyDmOnly ?? false);
        if (channelList.length > 0) {
          setActiveChannelId(channelList[0].id);
        }
        setReady(true);
      })
      .catch(() => router.push('/login'));

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    setTypingUserIds([]);
  }, [activeChannelId]);

  useEffect(() => {
    fetchGifsEnabled().then(({ enabled }) => setGifsEnabled(enabled));
  }, []);

  useEffect(() => {
    channelsRef.current = channels;
    const totalUnread = channels.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0);
    setDesktopUnreadCount(totalUnread);
  }, [channels]);

  useEffect(() => {
    if (!activeChannelId) return;
    setMessagesLoading(true);
    socketRef.current?.emit('joinChannel', activeChannelId);
    fetchMessages(activeChannelId)
      .then(setMessages)
      .finally(() => setMessagesLoading(false));
    fetchPinnedMessages(activeChannelId).then(setPinnedMessages);
    fetchReadReceipts(activeChannelId).then(setReadReceipts);
    setReplyingTo(null);
    setPinnedPanelOpen(false);

    setChannels((prev) =>
      prev.map((c) => (c.id === activeChannelId ? { ...c, unreadCount: 0 } : c)),
    );
    socketRef.current?.emit('markRead', activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!draft.trim() || !activeChannelId) return;
      socketRef.current?.emit('sendMessage', {
        channelId: activeChannelId,
        content: draft,
        replyToId: replyingTo?.id,
      });
      setDraft('');
      setReplyingTo(null);
    },
    [draft, activeChannelId, replyingTo],
  );

  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    setEditDraft(message.content);
  }

  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

  function toggleReaction(message: ChatMessage, emoji: string) {
    const alreadyReacted = message.reactions.some((r) => r.userId === currentUserId && r.emoji === emoji);
    socketRef.current?.emit(alreadyReacted ? 'removeReaction' : 'addReaction', {
      messageId: message.id,
      emoji,
    });
    setEmojiPickerFor(null);
  }

  function togglePin(messageId: string) {
    socketRef.current?.emit('togglePin', { messageId });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editDraft.trim()) return;
    socketRef.current?.emit('editMessage', { messageId: editingId, content: editDraft });
    setEditingId(null);
  }

  function deleteMessage(messageId: string) {
    if (!window.confirm('Delete this message?')) return;
    socketRef.current?.emit('deleteMessage', { messageId });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!activeChannelId) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      lastTypingEmitRef.current = now;
      socketRef.current?.emit('typing', activeChannelId);
    }
  }

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const channel = await createChannel(
      newChannelName.trim(),
      newChannelType,
      newChannelPrivate,
      newChannelPrivate ? newChannelMemberIds : [],
      newChannelPrivate ? newChannelRoleIds : [],
    );
    // Same as openDm: refetch for the enriched shape (unreadCount, dmParticipant) rather
    // than trusting the raw create response.
    const refreshed = await fetchChannels();
    setChannels(refreshed);
    setNewChannelName('');
    setNewChannelPrivate(false);
    setNewChannelMemberIds([]);
    setNewChannelRoleIds([]);
    setActiveChannelId(channel.id);
  }

  function toggleNewChannelMember(userId: string) {
    setNewChannelMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function toggleNewChannelRole(roleId: string) {
    setNewChannelRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  async function openDm(userId: string) {
    const existing = channels.find((c) => c.type === 'DM' && c.dmParticipant?.id === userId);
    if (existing) {
      setActiveChannelId(existing.id);
      return;
    }
    const channel = await createDm(userId);
    // The raw createDm response doesn't include the enriched dmParticipant/unreadCount
    // fields (only findAllForUser computes those) - refetch for a consistent shape.
    const refreshed = await fetchChannels();
    setChannels(refreshed);
    setActiveChannelId(channel.id);
  }

  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('username');
    disconnectSocket();
    router.push('/login');
  }

  function handleStatusChange(status: 'ONLINE' | 'AWAY' | 'BUSY', reason?: string) {
    manualStatusRef.current = status === 'ONLINE' ? null : status;
    socketRef.current?.emit('setStatus', { status, reason });
    if (currentUserId) {
      setPresence((prev) => ({ ...prev, [currentUserId]: status }));
    }
    setStatusMenuOpen(false);
    setAwayReasonPromptOpen(false);
    setAwayReasonDraft('');
  }

  function selectChannel(channelId: string) {
    setActiveChannelId(channelId);
    setMobileNavOpen(false);
    setDmCallOpen(false);
  }

  async function handleToggleMute(channelId: string, muted: boolean) {
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, muted } : c)));
    await setChannelMuted(channelId, muted);
  }

  async function handleToggleDmOnly() {
    const next = !notifyDmOnly;
    setNotifyDmOnlyState(next);
    await setNotifyDmOnly(next);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function openToast(id: string) {
    const toast = toasts.find((t) => t.id === id);
    dismissToast(id);
    if (toast) setActiveChannelId(toast.channelId);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUserId) return;
    setUploading(true);
    try {
      const updated = await uploadAvatar(file);
      setUsers((prev) =>
        prev.map((u) => (u.id === currentUserId ? { ...u, avatar: updated.avatar } : u)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Avatar upload failed');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setUploading(false);
    }
  }

  async function handleChannelAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChannelId) return;
    setUploading(true);
    try {
      const updated = await uploadChannelAvatar(activeChannelId, file);
      setChannels((prev) =>
        prev.map((c) => (c.id === activeChannelId ? { ...c, avatar: updated.avatar } : c)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Channel avatar upload failed');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChannelId) return;
    setUploading(true);
    try {
      const attachment = await uploadAttachment(activeChannelId, file);
      socketRef.current?.emit('sendMessage', {
        channelId: activeChannelId,
        content: draft,
        attachment,
      });
      setDraft('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'File upload failed');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setUploading(false);
    }
  }

  function insertAtCursor(text: string) {
    const input = composerInputRef.current;
    if (!input) {
      setDraft((prev) => prev + text);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + text.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

  function sendGif(gif: GifResult) {
    if (!activeChannelId) return;
    socketRef.current?.emit('sendMessage', {
      channelId: activeChannelId,
      content: '',
      attachment: { url: gif.url, filename: 'gif.gif', mimeType: 'image/gif', size: 0 },
    });
    setShowGifPicker(false);
  }

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-term-bg text-term-muted">
        Loading…
      </div>
    );
  }

  const publicChannels = channels.filter((c) => c.type === 'TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'VOICE');
  const dmChannels = channels.filter((c) => c.type === 'DM');
  const currentUser = users.find((u) => u.id === currentUserId);
  const otherUsers = users.filter((u) => u.id !== currentUserId);
  const canCreateChannels = currentUser?.role === 'ADMIN' || currentUser?.role === 'MOD';
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeChannelLabel = activeChannel
    ? activeChannel.type === 'DM'
      ? (activeChannel.dmParticipant?.displayName ?? 'Direct message')
      : activeChannel.name
    : null;
  const currentStatus = currentUserId ? (presence[currentUserId] ?? 'ONLINE') : 'ONLINE';

  return (
    <div className="flex h-screen w-full bg-term-bg text-term-green-bright">
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-20 bg-term-overlay md:hidden"
        />
      )}

      <aside
        style={{ width: sidebarWidth }}
        className={`${mobileNavOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-30 shrink-0 flex-col border-r border-term-line bg-term-panel md:static md:z-auto md:flex`}
      >
        <div className="border-b border-term-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Internal Chat</h1>
            <button
              onClick={() => setSearchPanelOpen(true)}
              title="Search messages"
              className="text-term-muted hover:text-term-green-bright"
            >
              🔍
            </button>
          </div>
          {username && currentUserId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => avatarInputRef.current?.click()}
                title="Change avatar"
                className="rounded-full opacity-90 hover:opacity-100"
              >
                <Avatar
                  id={currentUserId}
                  displayName={currentUser?.displayName ?? username}
                  avatarUrl={currentUser?.avatar}
                  size={28}
                />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />

              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs text-term-muted hover:text-term-green-bright"
                >
                  <span>{username}</span>
                  <span className="text-term-muted">
                    · {STATUS_OPTIONS.find((s) => s.value === currentStatus)?.label ?? currentStatus}
                  </span>
                </button>
                {statusMenuOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded border border-term-line bg-term-input py-1 shadow-lg">
                    {!awayReasonPromptOpen &&
                      STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() =>
                            option.value === 'AWAY'
                              ? setAwayReasonPromptOpen(true)
                              : handleStatusChange(option.value)
                          }
                          className="block w-full px-2 py-1 text-left text-xs text-term-green-bright hover:bg-term-line"
                        >
                          {option.label}
                        </button>
                      ))}
                    {awayReasonPromptOpen && (
                      <div className="px-2 py-1">
                        <p className="mb-1 text-[11px] text-term-muted">Stepping away for…</p>
                        <div className="mb-1 flex flex-wrap gap-1">
                          {['Lunch', 'Bathroom', 'Meeting', 'Break'].map((preset) => (
                            <button
                              key={preset}
                              onClick={() => handleStatusChange('AWAY', preset)}
                              className="rounded border border-term-line px-1.5 py-0.5 text-[11px] text-term-green-bright hover:bg-term-line"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleStatusChange('AWAY', awayReasonDraft || undefined);
                          }}
                          className="flex gap-1"
                        >
                          <input
                            autoFocus
                            value={awayReasonDraft}
                            onChange={(e) => setAwayReasonDraft(e.target.value)}
                            placeholder="Custom reason…"
                            className="flex-1 rounded border border-term-line bg-term-panel px-1.5 py-0.5 text-[11px] outline-none focus:border-term-green"
                          />
                          <button
                            type="submit"
                            className="rounded bg-term-green-dim px-2 py-0.5 text-[11px] font-medium text-term-bg hover:bg-term-green"
                          >
                            Go
                          </button>
                        </form>
                      </div>
                    )}
                    <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-term-line px-2 pt-1.5 text-xs text-term-green-bright hover:bg-term-line">
                      <input
                        type="checkbox"
                        checked={notifyDmOnly}
                        onChange={handleToggleDmOnly}
                        className="accent-indigo-600"
                      />
                      Notify me for DMs only
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          <div>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-term-muted">
              Channels
            </p>
            {publicChannels.length === 0 && (
              <p className="px-2 py-1 text-xs text-term-muted">No channels yet</p>
            )}
            {publicChannels.map((channel) => (
              <div
                key={channel.id}
                className={`group flex w-full items-center rounded text-sm ${
                  channel.id === activeChannelId
                    ? 'bg-term-input text-term-green-bright'
                    : 'text-term-muted hover:bg-term-input/50'
                }`}
              >
                <button
                  onClick={() => selectChannel(channel.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left"
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={`flex items-center gap-1.5 ${channel.muted ? 'opacity-50' : ''}`}>
                      <Avatar id={channel.id} displayName={channel.name} avatarUrl={channel.avatar} size={18} />
                      {channel.isPrivate && <span className="text-xs">🔒</span>}
                      {channel.name}
                    </span>
                    {channel.unreadCount > 0 && (
                      <span className="rounded-full bg-term-green-dim px-1.5 text-[10px] font-semibold text-term-bg">
                        {channel.unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-xs text-term-muted">
                    {channel.lastMessage
                      ? `${channel.lastMessage.senderName}: ${channel.lastMessage.content || '📎 Attachment'}`
                      : 'No messages yet'}
                  </span>
                </button>
                <button
                  onClick={() => handleToggleMute(channel.id, !channel.muted)}
                  title={channel.muted ? 'Unmute' : 'Mute'}
                  className="hidden px-2 text-xs text-term-muted hover:text-term-green-bright group-hover:block"
                >
                  {channel.muted ? '🔕' : '🔔'}
                </button>
              </div>
            ))}
            {canCreateChannels && (
              <form onSubmit={handleCreateChannel} className="mt-1 space-y-1 px-2">
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="New channel"
                  className="w-full rounded border border-term-line bg-term-input px-2 py-1 text-xs outline-none focus:border-term-green"
                />
                <div className="flex gap-2 text-[11px] text-term-muted">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={newChannelType === 'TEXT'}
                      onChange={() => setNewChannelType('TEXT')}
                    />
                    Text
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={newChannelType === 'VOICE'}
                      onChange={() => setNewChannelType('VOICE')}
                    />
                    Voice
                  </label>
                </div>
                <label className="flex items-center gap-1 text-[11px] text-term-muted">
                  <input
                    type="checkbox"
                    checked={newChannelPrivate}
                    onChange={(e) => setNewChannelPrivate(e.target.checked)}
                  />
                  🔒 Private
                </label>
                {newChannelPrivate && (
                  <div className="max-h-24 space-y-0.5 overflow-y-auto rounded border border-term-line p-1">
                    {otherUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-1 px-1 text-[11px] text-term-muted"
                      >
                        <input
                          type="checkbox"
                          checked={newChannelMemberIds.includes(user.id)}
                          onChange={() => toggleNewChannelMember(user.id)}
                        />
                        {user.displayName}
                      </label>
                    ))}
                  </div>
                )}
                {newChannelPrivate && roles.length > 0 && (
                  <div className="max-h-24 space-y-0.5 overflow-y-auto rounded border border-term-line p-1">
                    <p className="px-1 text-[10px] uppercase tracking-wide text-term-muted">Restrict to roles</p>
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-1 px-1 text-[11px] text-term-muted"
                      >
                        <input
                          type="checkbox"
                          checked={newChannelRoleIds.includes(role.id)}
                          onChange={() => toggleNewChannelRole(role.id)}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                )}
              </form>
            )}
          </div>

          {voiceChannels.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-term-muted">
                Voice Channels
              </p>
              {voiceChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                    channel.id === activeChannelId
                      ? 'bg-term-input text-term-green-bright'
                      : 'text-term-muted hover:bg-term-input/50'
                  }`}
                >
                  <span>
                    🔊 {channel.isPrivate && '🔒 '}
                    {channel.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {dmChannels.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-term-muted">
                Direct Messages
              </p>
              {dmChannels.map((channel) => (
                <div
                  key={channel.id}
                  className={`group flex w-full items-center rounded text-sm ${
                    channel.id === activeChannelId
                      ? 'bg-term-input text-term-green-bright'
                      : 'text-term-muted hover:bg-term-input/50'
                  }`}
                >
                  <button
                    onClick={() => selectChannel(channel.id)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left"
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className={`flex items-center gap-2 ${channel.muted ? 'opacity-50' : ''}`}>
                        {channel.dmParticipant && (
                          <Avatar
                            id={channel.dmParticipant.id}
                            displayName={channel.dmParticipant.displayName}
                            avatarUrl={channel.dmParticipant.avatar}
                            status={presence[channel.dmParticipant.id] ?? 'OFFLINE'}
                            size={32}
                          />
                        )}
                        {channel.dmParticipant?.displayName ?? 'Direct message'}
                      </span>
                      {channel.unreadCount > 0 && (
                        <span className="rounded-full bg-term-green-dim px-1.5 text-[10px] font-semibold text-term-bg">
                          {channel.unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate pl-10 text-xs text-term-muted">
                      {channel.lastMessage
                        ? `${channel.lastMessage.senderName}: ${channel.lastMessage.content || '📎 Attachment'}`
                        : 'No messages yet'}
                    </span>
                  </button>
                  <button
                    onClick={() => handleToggleMute(channel.id, !channel.muted)}
                    title={channel.muted ? 'Unmute' : 'Mute'}
                    className="hidden px-2 text-xs text-term-muted hover:text-term-green-bright group-hover:block"
                  >
                    {channel.muted ? '🔕' : '🔔'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </nav>

        <button
          onClick={() => setCalendarPanelOpen(true)}
          className="border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
        >
          Calendar
        </button>
        <button
          onClick={() => setReportsPanelOpen(true)}
          className="border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
        >
          Reports
        </button>
        {canCreateChannels && (
          <button
            onClick={() => setAdminDashboardOpen(true)}
            className="border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
          >
            Admin
          </button>
        )}
        <button
          onClick={() => setBotsPanelOpen(true)}
          className="border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
        >
          Bots
        </button>
        <div className="border-t border-term-line">
          <PushNotificationToggle />
        </div>
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-1.5 border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={handleLogout}
          className="border-t border-term-line p-2 text-left text-xs text-term-muted hover:text-term-green-bright"
        >
          Log out
        </button>
      </aside>

      <div
        onMouseDown={startSidebarResize}
        className="hidden w-1 shrink-0 cursor-col-resize bg-term-line/0 hover:bg-term-green-dim md:block"
      />

      {botsPanelOpen && <BotsPanel onClose={() => setBotsPanelOpen(false)} />}
      {reportsPanelOpen && <ReportsPanel onClose={() => setReportsPanelOpen(false)} />}
      {adminDashboardOpen && (
        <AdminDashboard
          currentUserRole={currentUser?.role}
          onClose={() => {
            setAdminDashboardOpen(false);
            // Roles may have changed while the dashboard was open (created/deleted) -
            // refresh so the new-channel role-restriction checklist stays current.
            fetchRoles()
              .then(setRoles)
              .catch(() => {});
          }}
        />
      )}
      {calendarPanelOpen && (
        <CalendarPanel
          channels={channels}
          currentUserId={currentUserId}
          onClose={() => setCalendarPanelOpen(false)}
        />
      )}
      {searchPanelOpen && (
        <SearchPanel
          channels={channels}
          onClose={() => setSearchPanelOpen(false)}
          onOpenChannel={selectChannel}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-term-line px-4 py-3">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="text-term-muted hover:text-term-green-bright md:hidden"
            title="Open channels"
          >
            ☰
          </button>
          {activeChannel && activeChannel.type !== 'DM' && (
            <>
              <input
                ref={channelAvatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleChannelAvatarChange}
              />
              <button
                onClick={() => canCreateChannels && channelAvatarInputRef.current?.click()}
                title={canCreateChannels ? 'Change channel avatar' : undefined}
                className={canCreateChannels ? 'rounded-full opacity-90 hover:opacity-100' : 'cursor-default'}
              >
                <Avatar id={activeChannel.id} displayName={activeChannel.name} avatarUrl={activeChannel.avatar} size={28} />
              </button>
            </>
          )}
          <h2 className="flex items-center gap-1 text-sm font-semibold">
            {activeChannel?.isPrivate && <span>🔒</span>}
            {activeChannel
              ? activeChannel.type === 'DM'
                ? activeChannelLabel
                : activeChannel.type === 'VOICE'
                  ? `🔊 ${activeChannelLabel}`
                  : activeChannelLabel
              : 'Select a channel'}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {activeChannel && (
              <button
                onClick={() => setPinnedPanelOpen((open) => !open)}
                className={`text-xs font-medium ${
                  pinnedPanelOpen ? 'text-term-green-bright' : 'text-term-muted hover:text-term-green-bright'
                }`}
              >
                📌 Pinned{pinnedMessages.length > 0 ? ` (${pinnedMessages.length})` : ''}
              </button>
            )}
            {activeChannel?.type === 'DM' && (
              <button
                onClick={() => setDmCallOpen((open) => !open)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  dmCallOpen ? 'bg-term-green-dim text-term-bg' : 'text-term-muted hover:bg-term-input'
                }`}
              >
                📞 {dmCallOpen ? 'Hide call' : 'Call'}
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setMembersPanelOpen((open) => !open)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  membersPanelOpen ? 'text-term-green-bright' : 'text-term-muted hover:text-term-green-bright'
                }`}
              >
                👥 Members
              </button>
              {membersPanelOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 max-h-80 w-56 overflow-y-auto rounded border border-term-line bg-term-panel p-1 shadow-lg">
                  {otherUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        openDm(user.id);
                        setMembersPanelOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-term-muted hover:bg-term-input/50"
                    >
                      <Avatar
                        id={user.id}
                        displayName={user.displayName}
                        avatarUrl={user.avatar}
                        status={presence[user.id] ?? 'OFFLINE'}
                        size={20}
                      />
                      {user.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {pinnedPanelOpen && (
          <div className="max-h-40 overflow-y-auto border-b border-term-line bg-term-panel/60 px-4 py-2">
            {pinnedMessages.length === 0 ? (
              <p className="text-xs text-term-muted">No pinned messages in this channel.</p>
            ) : (
              pinnedMessages.map((m) => (
                <div key={m.id} className="py-1 text-xs text-term-muted">
                  <span className="font-medium text-term-green-bright">
                    {m.author?.displayName ?? m.bot?.name ?? 'System'}:
                  </span>{' '}
                  {m.content}
                </div>
              ))
            )}
          </div>
        )}

        {activeChannel?.type === 'VOICE' && (
          <VoiceCallBar key={activeChannel.id} channelId={activeChannel.id} label={activeChannel.name} />
        )}
        {activeChannel?.type === 'DM' && dmCallOpen && (
          <VoiceCallBar
            key={activeChannel.id}
            channelId={activeChannel.id}
            label={activeChannelLabel ?? 'Direct message'}
          />
        )}

        {errorMessage && (
          <div className="border-b border-term-red bg-term-red/10 px-4 py-2 text-xs text-term-red">
            {errorMessage}
          </div>
        )}

        {statusToast && (
          <div className="border-b border-term-line bg-term-panel/60 px-4 py-2 text-xs text-term-green-bright">
            {statusToast}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messagesLoading && <p className="text-xs text-term-muted">Loading messages…</p>}
          {!messagesLoading && activeChannel && messages.length === 0 && (
            <p className="text-xs text-term-muted">No messages yet. Say hello.</p>
          )}
          {messages.map((message, index) => {
            const isOwn = message.authorId === currentUserId;
            const isEditing = editingId === message.id;
            const isLastMessage = index === messages.length - 1;
            const reactionGroups = message.reactions.reduce<Record<string, string[]>>((acc, r) => {
              (acc[r.emoji] ??= []).push(r.userId);
              return acc;
            }, {});
            const seenBy = isLastMessage
              ? readReceipts.filter((r) => new Date(r.lastReadAt) >= new Date(message.createdAt))
              : [];
            return (
              <div key={message.id} className="group text-sm">
                <div className="flex items-center gap-2">
                  <Avatar
                    id={message.author?.id ?? message.bot?.id ?? message.id}
                    displayName={message.author?.displayName ?? message.bot?.name ?? 'System'}
                    avatarUrl={message.author?.avatar}
                    size={22}
                  />
                  <span className="font-medium text-term-green-bright">
                    {message.author?.displayName ?? message.bot?.name ?? 'System'}
                  </span>
                  {message.bot && (
                    <span className="rounded bg-term-line px-1 text-[10px] font-semibold uppercase text-term-green-bright">
                      Bot
                    </span>
                  )}
                  <span className="text-xs text-term-muted">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </span>
                  {message.editedAt && <span className="text-xs text-term-muted">(edited)</span>}
                  {message.pinnedAt && <span className="text-xs text-term-green-bright">📌 pinned</span>}
                  {!isEditing && (
                    <span className="ml-2 hidden gap-2 text-xs text-term-muted group-hover:inline-flex">
                      <button onClick={() => setReplyingTo(message)} className="hover:text-term-green-bright">
                        Reply
                      </button>
                      <button
                        onClick={() => setEmojiPickerFor(emojiPickerFor === message.id ? null : message.id)}
                        className="hover:text-term-green-bright"
                      >
                        React
                      </button>
                      <button onClick={() => togglePin(message.id)} className="hover:text-term-green-bright">
                        {message.pinnedAt ? 'Unpin' : 'Pin'}
                      </button>
                      {isOwn && (
                        <>
                          <button onClick={() => startEdit(message)} className="hover:text-term-green-bright">
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="hover:text-term-red"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
                {message.replyTo && (
                  <div className="ml-8 mb-0.5 truncate border-l-2 border-term-line pl-2 text-xs text-term-muted">
                    ↪ {message.replyTo.author?.displayName ?? message.replyTo.bot?.name ?? 'System'}:{' '}
                    {message.replyTo.content}
                  </div>
                )}
                {isEditing ? (
                  <form onSubmit={submitEdit} className="ml-8 mt-1 flex gap-2">
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="flex-1 rounded border border-term-line bg-term-input px-2 py-1 text-sm outline-none focus:border-term-green"
                    />
                    <button
                      type="submit"
                      className="rounded bg-term-green-dim px-2 py-1 text-xs font-medium text-term-bg hover:bg-term-green"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded px-2 py-1 text-xs text-term-muted hover:text-term-green-bright"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    {message.content && (
                      <p className="ml-8 text-term-green-bright">
                        <MessageContent content={message.content} />
                      </p>
                    )}
                    {message.attachmentUrl &&
                      (message.attachmentMimeType?.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served from our own backend
                        <img
                          src={message.attachmentUrl}
                          alt={message.attachmentName ?? 'attachment'}
                          className="ml-8 mt-1 max-h-64 max-w-xs rounded border border-term-line"
                        />
                      ) : (
                        <a
                          href={message.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={message.attachmentName}
                          className="ml-8 mt-1 flex w-fit items-center gap-2 rounded border border-term-line bg-term-input px-3 py-2 text-xs text-term-green-bright hover:border-term-green"
                        >
                          <span>📎</span>
                          <span>{message.attachmentName}</span>
                          {message.attachmentSize != null && (
                            <span className="text-term-muted">
                              {formatBytes(message.attachmentSize)}
                            </span>
                          )}
                        </a>
                      ))}
                  </>
                )}
                {(Object.keys(reactionGroups).length > 0 || emojiPickerFor === message.id) && (
                  <div className="ml-8 mt-1 flex flex-wrap items-center gap-1">
                    {Object.entries(reactionGroups).map(([emoji, userIds]) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(message, emoji)}
                        className={`rounded-full border px-1.5 py-0.5 text-xs ${
                          userIds.includes(currentUserId ?? '')
                            ? 'border-term-green bg-term-green-dim/20 text-term-green-bright'
                            : 'border-term-line bg-term-input text-term-muted'
                        }`}
                      >
                        {emoji} {userIds.length}
                      </button>
                    ))}
                    {emojiPickerFor === message.id && (
                      <span className="flex items-center gap-1 rounded-full border border-term-line bg-term-input px-1.5 py-0.5">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(message, emoji)}
                            className="hover:scale-125"
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {seenBy.length > 0 && (
                  <p className="ml-8 mt-0.5 text-[11px] text-term-muted">
                    Seen by {seenBy.map((r) => r.displayName).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {typingUserIds.length > 0 && (
          <p className="px-4 pb-1 text-xs italic text-term-muted">
            {typingUserIds
              .map((id) => users.find((u) => u.id === id)?.displayName ?? 'Someone')
              .join(', ')}{' '}
            {typingUserIds.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}

        {replyingTo && (
          <div className="flex items-center justify-between border-t border-term-line bg-term-panel/60 px-4 py-1.5 text-xs text-term-muted">
            <span className="truncate">
              Replying to{' '}
              <span className="font-medium text-term-green-bright">
                {replyingTo.author?.displayName ?? replyingTo.bot?.name ?? 'System'}
              </span>
              : {replyingTo.content}
            </span>
            <button onClick={() => setReplyingTo(null)} className="ml-2 shrink-0 hover:text-term-green-bright">
              ✕
            </button>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex gap-2 border-t border-term-line p-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleAttachmentChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeChannel || uploading}
            title="Attach a file"
            className="rounded border border-term-line px-3 py-2 text-sm text-term-muted hover:border-term-green hover:text-term-green-bright disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
          <div className="relative flex-1">
            <input
              ref={composerInputRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder={
                uploading
                  ? 'Uploading…'
                  : activeChannel
                    ? `Message ${activeChannelLabel}`
                    : 'Select a channel'
              }
              disabled={!activeChannel}
              className="w-full rounded border border-term-line bg-term-input py-2 pl-3 pr-28 text-sm text-term-green-bright outline-none focus:border-term-green disabled:opacity-50"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-term-muted">
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((v) => !v);
                  setShowGifPicker(false);
                  setShowCommandsMenu(false);
                }}
                title="Emoji"
                className="hover:text-term-green-bright"
              >
                <Smile size={16} />
              </button>
              {gifsEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setShowGifPicker((v) => !v);
                    setShowEmojiPicker(false);
                    setShowCommandsMenu(false);
                  }}
                  title="GIF"
                  className="hover:text-term-green-bright"
                >
                  <Film size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowCommandsMenu((v) => !v);
                  setShowEmojiPicker(false);
                  setShowGifPicker(false);
                }}
                title="Bot commands"
                className="hover:text-term-green-bright"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            {showEmojiPicker && (
              <EmojiPickerPopover
                onSelect={(emoji) => insertAtCursor(emoji)}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
            {showGifPicker && <GifPickerPopover onSelect={sendGif} onClose={() => setShowGifPicker(false)} />}
            {showCommandsMenu && (
              <CommandsLauncherPopover
                onSelect={(prefixedName) => {
                  insertAtCursor(prefixedName);
                  setShowCommandsMenu(false);
                }}
                onClose={() => setShowCommandsMenu(false)}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!activeChannel || !draft.trim()}
            className="rounded bg-term-green-dim px-4 py-2 text-sm font-medium text-term-bg hover:bg-term-green disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={openToast} />
    </div>
  );
}
