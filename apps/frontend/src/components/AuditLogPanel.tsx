'use client';

import { useEffect, useState } from 'react';
import { type AuditLogEntry, fetchAuditLog } from '@/lib/api';

const ACTION_LABELS: Record<string, string> = {
  'user.role_changed': 'changed role of',
  'channel.created': 'created channel',
  'message.deleted': 'deleted a message in',
  'bot.created': 'created bot',
  'bot.deleted': 'deleted bot',
};

function describe(entry: AuditLogEntry): string {
  const actor = entry.actor?.displayName ?? 'System';
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const meta = entry.metadata;
  const subject =
    (meta?.name as string) ?? (meta?.username as string) ?? entry.targetId ?? '';
  return `${actor} ${label} ${subject}`.trim();
}

export function AuditLogPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Audit Log</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {loading && <p className="text-xs text-neutral-600">Loading…</p>}
          {!loading && entries.length === 0 && (
            <p className="text-xs text-neutral-600">No audit events yet.</p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded border border-neutral-800 px-3 py-2 text-xs"
            >
              <span className="text-neutral-300">{describe(entry)}</span>
              <span className="shrink-0 pl-3 text-neutral-500">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
