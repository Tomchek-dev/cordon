'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client';
import { fetchVoiceToken } from '@/lib/api';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

// Only mobile browsers (notably iOS Safari) kill mic access once backgrounded;
// desktop browsers and the Tauri desktop shell handle background audio fine,
// so the foreground-only workaround below should not apply to them.
function isMobileBrowser() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {
    // Audio not available (e.g. autoplay policy) - non-critical, skip the chime.
  }
}

export function VoiceCallBar({
  channelId,
  label,
  socket,
  isAdmin,
  isAnnouncementChannel,
}: {
  channelId: string;
  label: string;
  socket: Socket | null;
  isAdmin: boolean;
  isAnnouncementChannel: boolean;
}) {
  // Announcement channels are listen-only for everyone except admins - this is
  // just presentation; the server already refuses to grant canPublish to a
  // non-admin's voice token for one of these channels (see VoiceService).
  const listenOnly = isAnnouncementChannel && !isAdmin;
  const openMic = isAnnouncementChannel && isAdmin;
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [speakingIdentities, setSpeakingIdentities] = useState<Set<string>>(new Set());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const selfIdentityRef = useRef<string | null>(null);
  // Mobile browsers (especially iOS Safari) can't reliably keep a mic track
  // alive once backgrounded, so PTT is foreground-only: we drop the room on
  // hide and race to rejoin on refocus. This flag distinguishes "we were
  // deliberately in a call and should snap back" from "the user left".
  const stayConnectedRef = useRef(false);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())]);
  }, []);

  const disconnect = useCallback(async () => {
    stayConnectedRef.current = false;
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setState('idle');
    setParticipants([]);
    setSpeakingIdentities(new Set());
    setTalking(false);
    setAudioBlocked(false);
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = '';
  }, []);

  useEffect(() => {
    // Leave the call automatically when the user switches away from this channel.
    return () => {
      stayConnectedRef.current = false;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [channelId]);

  async function join() {
    stayConnectedRef.current = true;
    setState('connecting');
    setError(null);
    try {
      const { token, wsUrl } = await fetchVoiceToken(channelId);
      const room = new Room();
      selfIdentityRef.current = room.localParticipant.identity;

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const identities = new Set(speakers.map((p) => p.identity));
        setSpeakingIdentities(identities);
        const someoneElseTalking = speakers.some((p) => p.identity !== selfIdentityRef.current);
        if (someoneElseTalking) playChime();
      });
      room.on(RoomEvent.ParticipantConnected, refreshParticipants);
      room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
      room.on(RoomEvent.Disconnected, () => {
        setState('idle');
        setParticipants([]);
      });
      // Remote audio isn't played anywhere until we attach it to a DOM
      // element ourselves - LiveKit only auto-*plays* tracks that are
      // already attached, it doesn't attach them for you.
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.autoplay = true;
        audioContainerRef.current?.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        track.detach().forEach((el) => el.remove());
      });
      // Browsers can block autoplay even on an attached+playing element
      // (common on mobile); surface a tap-to-resume prompt when that happens.
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      });

      await room.connect(wsUrl, token);
      // Publish the mic track muted; push-to-talk unmutes it only while held.
      await room.localParticipant.setMicrophoneEnabled(false);
      // Lets other channel members know a call just started (only fires a
      // notification server-side if we're the first participant).
      socket?.emit('voiceJoined', { channelId });

      roomRef.current = room;
      setState('connected');
      refreshParticipants();
    } catch (err) {
      console.error('voice join failed', err);
      setError(err instanceof Error ? err.message : 'Failed to join voice channel');
      setState('error');
    }
  }

  async function startTalking() {
    if (!roomRef.current || talking) return;
    setTalking(true);
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.error('mic enable failed', err);
      setError('Microphone permission denied');
      setTalking(false);
    }
  }

  async function stopTalking() {
    if (!roomRef.current || !talking) return;
    setTalking(false);
    await roomRef.current.localParticipant.setMicrophoneEnabled(false);
  }

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isMobileBrowser()) return;
    function handleVisibilityChange() {
      if (document.hidden) {
        if (roomRef.current) {
          // Drop the room quietly (leave stayConnectedRef set) rather than
          // calling disconnect(), which would cancel the rejoin-on-focus intent.
          roomRef.current.disconnect();
          roomRef.current = null;
          setState('idle');
          setParticipants([]);
          setSpeakingIdentities(new Set());
          setTalking(false);
          setAudioBlocked(false);
          if (audioContainerRef.current) audioContainerRef.current.innerHTML = '';
        }
      } else if (stayConnectedRef.current && !roomRef.current) {
        join();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [channelId]);

  return (
    <div className="border-b border-term-line bg-term-panel/60 px-4 py-3">
      <div ref={audioContainerRef} className="hidden" />
      {state === 'connected' && audioBlocked && (
        <button
          onClick={() => roomRef.current?.startAudio().then(() => setAudioBlocked(false))}
          className="mb-2 rounded bg-term-red px-3 py-1.5 text-sm font-medium text-term-bg hover:opacity-90"
        >
          🔊 Tap to enable audio
        </button>
      )}
      {state === 'idle' && (
        <button
          onClick={join}
          className="rounded bg-term-green-dim px-3 py-1.5 text-sm font-medium text-term-bg hover:bg-term-green"
        >
          🎙️ Join {label}
        </button>
      )}
      {state === 'connecting' && <p className="text-sm text-term-muted">Connecting…</p>}
      {state === 'error' && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-term-red">{error}</p>
          <button onClick={join} className="text-sm text-term-muted underline hover:text-term-green-bright">
            Retry
          </button>
        </div>
      )}
      {state === 'connected' && (
        <div className="flex flex-wrap items-center gap-4">
          {listenOnly ? (
            <span className="rounded bg-term-input px-4 py-2 text-sm font-medium text-term-muted">
              🔈 Listening only
            </span>
          ) : openMic ? (
            <button
              onClick={talking ? stopTalking : startTalking}
              className={`select-none rounded px-4 py-2 text-sm font-medium transition-colors ${
                talking ? 'bg-term-red text-term-bg hover:opacity-90' : 'bg-term-input text-term-green-bright hover:bg-term-line'
              }`}
            >
              {talking ? '🔴 Announcing… (tap to stop)' : '📢 Tap to announce'}
            </button>
          ) : (
            <button
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onMouseLeave={stopTalking}
              onTouchStart={(e) => {
                e.preventDefault();
                startTalking();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopTalking();
              }}
              className={`select-none rounded px-4 py-2 text-sm font-medium transition-colors ${
                talking ? 'bg-term-red text-term-bg hover:opacity-90' : 'bg-term-input text-term-green-bright hover:bg-term-line'
              }`}
            >
              {talking ? '🔴 Talking…' : '🎤 Hold to talk'}
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <span
                key={p.identity}
                className={`rounded-full px-2 py-1 text-xs ${
                  speakingIdentities.has(p.identity)
                    ? 'bg-term-green-dim text-term-bg'
                    : 'bg-term-input text-term-muted'
                }`}
              >
                {p.name || p.identity}
              </span>
            ))}
          </div>
          <button onClick={disconnect} className="ml-auto text-sm text-term-muted hover:text-term-red">
            Leave
          </button>
        </div>
      )}
    </div>
  );
}
