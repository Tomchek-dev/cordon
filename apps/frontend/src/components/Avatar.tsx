import type { PresenceStatus } from '@/lib/api';
import { colorFor, initials } from '@/lib/avatar';

const STATUS_COLOR: Record<PresenceStatus, string> = {
  ONLINE: '#22c55e',
  AWAY: '#eab308',
  BUSY: '#ef4444',
  OFFLINE: '#525252',
};

export function Avatar({
  id,
  displayName,
  avatarUrl,
  status,
  size = 28,
}: {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  status?: PresenceStatus;
  size?: number;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own backend, not Next's image pipeline
        <img
          src={avatarUrl}
          alt={displayName}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: colorFor(id) }}
        >
          {initials(displayName)}
        </span>
      )}
      {status && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-neutral-900"
          style={{ width: size * 0.32, height: size * 0.32, backgroundColor: STATUS_COLOR[status] }}
        />
      )}
    </span>
  );
}
