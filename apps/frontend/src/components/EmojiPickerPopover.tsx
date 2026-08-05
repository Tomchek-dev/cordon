'use client';

import { useMemo, useState } from 'react';

const EMOJI_CATEGORIES: { label: string; emoji: { char: string; keywords: string }[] }[] = [
  {
    label: 'Smileys',
    emoji: [
      { char: '😀', keywords: 'grin happy smile' },
      { char: '😂', keywords: 'laugh joy tears' },
      { char: '😊', keywords: 'smile blush happy' },
      { char: '😉', keywords: 'wink' },
      { char: '😍', keywords: 'love heart eyes' },
      { char: '🤔', keywords: 'think hmm' },
      { char: '😎', keywords: 'cool sunglasses' },
      { char: '😢', keywords: 'sad cry' },
      { char: '😮', keywords: 'wow surprised' },
      { char: '😴', keywords: 'sleep tired' },
      { char: '🙄', keywords: 'eyeroll annoyed' },
      { char: '😅', keywords: 'sweat nervous relief' },
    ],
  },
  {
    label: 'Gestures',
    emoji: [
      { char: '👍', keywords: 'thumbsup yes ok good' },
      { char: '👎', keywords: 'thumbsdown no bad' },
      { char: '👏', keywords: 'clap applause' },
      { char: '🙌', keywords: 'raised hands celebrate' },
      { char: '🙏', keywords: 'pray thanks please' },
      { char: '👋', keywords: 'wave hi bye hello' },
      { char: '💪', keywords: 'muscle strong flex' },
      { char: '🤝', keywords: 'handshake deal' },
      { char: '✌️', keywords: 'peace victory' },
      { char: '🤷', keywords: 'shrug dunno' },
    ],
  },
  {
    label: 'Objects & symbols',
    emoji: [
      { char: '🔥', keywords: 'fire lit hot' },
      { char: '🎉', keywords: 'party celebrate confetti' },
      { char: '✅', keywords: 'check done yes' },
      { char: '❌', keywords: 'x no wrong' },
      { char: '⚠️', keywords: 'warning caution' },
      { char: '💡', keywords: 'idea lightbulb' },
      { char: '📦', keywords: 'box package pickup' },
      { char: '🚚', keywords: 'truck shipping delivery' },
      { char: '⏰', keywords: 'clock alarm reminder' },
      { char: '❤️', keywords: 'heart love' },
      { char: '💯', keywords: 'hundred perfect' },
      { char: '🚀', keywords: 'rocket launch ship' },
    ],
  },
];

export function EmojiPickerPopover({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_CATEGORIES;
    return EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emoji: cat.emoji.filter((e) => e.keywords.includes(q)),
    })).filter((cat) => cat.emoji.length > 0);
  }, [query]);

  return (
    <div className="absolute bottom-full right-0 z-10 mb-2 w-64 rounded border border-term-line bg-term-panel p-2 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="w-full rounded border border-term-line bg-term-input px-2 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
        />
        <button onClick={onClose} className="shrink-0 text-term-muted hover:text-term-green-bright">
          ✕
        </button>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {filtered.length === 0 && <p className="text-xs text-term-muted">No matches.</p>}
        {filtered.map((cat) => (
          <div key={cat.label}>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-term-muted">{cat.label}</p>
            <div className="grid grid-cols-8 gap-1">
              {cat.emoji.map((e) => (
                <button
                  key={e.char}
                  onClick={() => onSelect(e.char)}
                  className="rounded text-lg hover:bg-term-input"
                  title={e.keywords}
                >
                  {e.char}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
