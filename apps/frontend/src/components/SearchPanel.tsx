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
    <div className="fixed inset-0 z-20 flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24">
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {loading && <p className="px-2 text-xs text-neutral-600">Searching…</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-2 text-xs text-neutral-600">No messages found.</p>
          )}
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                onOpenChannel(result.channelId);
                onClose();
              }}
              className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-neutral-800/50"
            >
              <span className="flex items-center gap-2 text-xs text-neutral-500">
                <span>{channelLabel(result)}</span>
                <span>·</span>
                <span>{result.author?.displayName ?? result.bot?.name ?? 'System'}</span>
                <span>·</span>
                <span>{new Date(result.createdAt).toLocaleString()}</span>
              </span>
              <span className="block text-neutral-300">{highlightSnippet(result.content, query)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
