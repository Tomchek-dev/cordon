'use client';

import { useEffect, useState } from 'react';
import { type GifResult, searchGifs } from '@/lib/api';

export function GifPickerPopover({
  onSelect,
  onClose,
}: {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchGifs(trimmed)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="absolute bottom-full right-0 z-10 mb-2 w-80 rounded border border-term-line bg-term-panel p-2 shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          className="w-full rounded border border-term-line bg-term-input px-2 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
        />
        <button onClick={onClose} className="shrink-0 text-term-muted hover:text-term-green-bright">
          ✕
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading && <p className="text-xs text-term-muted">Searching…</p>}
        {!loading && query.trim() && results.length === 0 && (
          <p className="text-xs text-term-muted">No results.</p>
        )}
        <div className="grid grid-cols-3 gap-1">
          {results.map((gif) => (
            // eslint-disable-next-line @next/next/no-img-element -- external Tenor thumbnail, not our own asset pipeline
            <img
              key={gif.id}
              src={gif.previewUrl}
              alt={gif.description}
              onClick={() => onSelect(gif)}
              className="aspect-video w-full cursor-pointer rounded object-cover hover:opacity-80"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
