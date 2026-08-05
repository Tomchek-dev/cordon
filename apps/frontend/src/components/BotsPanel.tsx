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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-term-overlay p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-term-line bg-term-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-term-green-bright">Bots</h2>
          <button onClick={onClose} className="text-term-muted hover:text-term-green-bright">
            ✕
          </button>
        </div>

        {newToken && (
          <div className="mb-4 rounded border border-term-green-dim bg-term-green-dim/10 p-3 text-xs text-term-green-bright">
            <p className="mb-1 font-semibold">
              Copy this token now — it won&apos;t be shown again:
            </p>
            <code className="block break-all rounded bg-term-bg/60 p-2">{newToken}</code>
            <p className="mt-2 text-term-muted">
              POST to{' '}
              <code className="text-term-green-bright">/api/bots/&lt;token&gt;/messages</code> with{' '}
              <code className="text-term-green-bright">{'{ "channelId": "...", "content": "..." }'}</code>
            </p>
          </div>
        )}

        <div className="mb-4 space-y-2 max-h-48 overflow-y-auto">
          {bots.length === 0 && <p className="text-xs text-term-muted">No bots yet.</p>}
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="flex items-center justify-between rounded border border-term-line px-3 py-2 text-sm"
            >
              <div>
                <p className="text-term-green-bright">{bot.name}</p>
                <p className="text-xs text-term-muted">
                  {bot.webhookUrl ? bot.webhookUrl : 'no webhook configured'}
                </p>
              </div>
              <button
                onClick={() => handleDelete(bot.id)}
                className="text-xs text-term-red hover:opacity-80"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} className="space-y-2 border-t border-term-line pt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bot name"
            className="w-full rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none focus:border-term-green"
          />
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL (optional)"
            className="w-full rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none focus:border-term-green"
          />
          {error && <p className="text-xs text-term-red">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-term-green-dim py-2 text-sm font-medium text-term-bg hover:bg-term-green"
          >
            Create bot
          </button>
        </form>
      </div>
    </div>
  );
}
