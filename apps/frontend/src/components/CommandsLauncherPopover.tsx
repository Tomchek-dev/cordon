'use client';

import { useEffect, useState } from 'react';
import { type CommandInfo, fetchCommands } from '@/lib/api';

export function CommandsLauncherPopover({
  onSelect,
  onClose,
}: {
  onSelect: (prefixedName: string) => void;
  onClose: () => void;
}) {
  const [slash, setSlash] = useState<CommandInfo[]>([]);
  const [bang, setBang] = useState<CommandInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommands()
      .then(({ slash, bang }) => {
        setSlash(slash);
        setBang(bang);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="absolute bottom-full right-0 z-10 mb-2 w-72 rounded border border-term-line bg-term-panel p-2 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-term-muted">Bot commands</p>
        <button onClick={onClose} className="text-term-muted hover:text-term-green-bright">
          ✕
        </button>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {loading && <p className="text-xs text-term-muted">Loading…</p>}
        {!loading && slash.length === 0 && bang.length === 0 && (
          <p className="text-xs text-term-muted">No commands registered.</p>
        )}
        {slash.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-term-muted">Slash</p>
            {slash.map((c) => (
              <button
                key={c.name}
                onClick={() => onSelect(`/${c.name} `)}
                className="block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-term-input"
              >
                <span className="text-term-green-bright">/{c.name}</span>{' '}
                <span className="text-term-muted">— {c.description}</span>
              </button>
            ))}
          </div>
        )}
        {bang.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-term-muted">Bang</p>
            {bang.map((c) => (
              <button
                key={c.name}
                onClick={() => onSelect(`!${c.name} `)}
                className="block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-term-input"
              >
                <span className="text-term-green-bright">!{c.name}</span>{' '}
                <span className="text-term-muted">— {c.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
