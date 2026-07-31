'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, register } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken } =
        mode === 'login'
          ? await login(username, password)
          : await register(username, displayName, password);
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('username', username);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-8"
      >
        <h1 className="text-xl font-semibold">
          {mode === 'login' ? 'Log in' : 'Create an account'}
        </h1>

        <div className="space-y-2">
          <input
            autoFocus
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {mode === 'register' && (
            <input
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-indigo-600 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          {mode === 'login' ? "Need an account? Register" : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  );
}
