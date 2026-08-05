'use client';

import { useEffect, useState } from 'react';
import { type Channel, type SearchResult, searchMessages } from '@/lib/api';

function highlightSnippet(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 140);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 60);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

export function SearchPanel({
  channels,
  onClose,
  onOpenChannel,
}: {
  channels: Channel[];
  onClose: () => void;
  onOpenChannel: (channelId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchMessages(trimmed)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function channelLabel(result: SearchResult): string {
    if (result.channel.type === 'DM') {
      const channel = channels.find((c) => c.id === result.channel.id);
      return channel?.dmParticipant?.displayName ?? 'Direct message';
    }
    return `#${result.channel.name}`;
  }

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center bg-term-overlay p-4 pt-16 sm:pt-24">
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col rounded border border-term-line bg-term-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none focus:border-term-green"
          />
          <button onClick={onClose} className="text-term-muted hover:text-term-green-bright">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {loading && <p className="px-2 text-xs text-term-muted">Searching…</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-2 text-xs text-term-muted">No messages found.</p>
          )}
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                onOpenChannel(result.channelId);
                onClose();
              }}
              className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-term-input/50"
            >
              <span className="flex items-center gap-2 text-xs text-term-muted">
                <span>{channelLabel(result)}</span>
                <span>·</span>
                <span>{result.author?.displayName ?? result.bot?.name ?? 'System'}</span>
                <span>·</span>
                <span>{new Date(result.createdAt).toLocaleString()}</span>
              </span>
              <span className="block text-term-green-bright">{highlightSnippet(result.content, query)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
