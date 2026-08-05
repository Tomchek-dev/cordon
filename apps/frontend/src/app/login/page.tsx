'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';
import { login, register } from '@/lib/api';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

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
    <div className="flex min-h-screen items-center justify-center bg-term-bg p-4 text-term-green-bright">
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed right-4 top-4 text-term-muted hover:text-term-green-bright"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded border border-term-line bg-term-panel p-8"
      >
        <p className="text-xs tracking-widest text-term-muted">CORDON //</p>
        <h1 className="text-xl font-semibold text-term-green-bright">
          {mode === 'login' ? 'LOG_IN' : 'CREATE_ACCOUNT'}
        </h1>

        <div className="space-y-2">
          <input
            autoFocus
            className="w-full rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none placeholder:text-term-muted focus:border-term-green"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {mode === 'register' && (
            <input
              className="w-full rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none placeholder:text-term-muted focus:border-term-green"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full rounded border border-term-line bg-term-input px-3 py-2 text-sm text-term-green-bright outline-none placeholder:text-term-muted focus:border-term-green"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-term-red">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-term-green-dim py-2 text-sm font-medium text-term-bg hover:bg-term-green disabled:opacity-50"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="w-full text-center text-xs text-term-muted hover:text-term-green-bright"
        >
          {mode === 'login' ? "Need an account? Register" : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  );
}
