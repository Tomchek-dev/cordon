'use client';

import { useEffect, useState } from 'react';
import { type Bot, createBot, deleteBot, fetchBots } from '@/lib/api';

export function BotsPanel({ onClose }: { onClose: () => void }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBots().then(setBots);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const bot = await createBot(name.trim(), webhookUrl.trim());
      setBots((prev) => [...prev, bot]);
      setNewToken(bot.token);
      setName('');
      setWebhookUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bot');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this bot? Its token will stop working immediately.')) return;
    await deleteBot(id);
    setBots((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Bots</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        {newToken && (
          <div className="mb-4 rounded border border-indigo-800 bg-indigo-950/50 p-3 text-xs text-indigo-200">
            <p className="mb-1 font-semibold">
              Copy this token now — it won&apos;t be shown again:
            </p>
            <code className="block break-all rounded bg-black/30 p-2">{newToken}</code>
            <p className="mt-2 text-neutral-400">
              POST to{' '}
              <code className="text-neutral-300">/api/bots/&lt;token&gt;/messages</code> with{' '}
              <code className="text-neutral-300">{'{ "channelId": "...", "content": "..." }'}</code>
            </p>
          </div>
        )}

        <div className="mb-4 space-y-2 max-h-48 overflow-y-auto">
          {bots.length === 0 && <p className="text-xs text-neutral-600">No bots yet.</p>}
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="flex items-center justify-between rounded border border-neutral-800 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-neutral-200">{bot.name}</p>
                <p className="text-xs text-neutral-500">
                  {bot.webhookUrl ? bot.webhookUrl : 'no webhook configured'}
                </p>
              </div>
              <button
                onClick={() => handleDelete(bot.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} className="space-y-2 border-t border-neutral-800 pt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bot name"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL (optional)"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-indigo-600 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Create bot
          </button>
        </form>
      </div>
    </div>
  );
}
