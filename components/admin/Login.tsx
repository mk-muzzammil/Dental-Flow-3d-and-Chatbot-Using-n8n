'use client';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect, useState } from 'react';
import { refreshAccess } from './client';
export function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    void refreshAccess().then((ok) => {
      if (ok && active) window.location.replace('/admin/portal');
    }).catch(() => undefined).finally(() => { if (active) setChecking(false); });
    return () => {
      active = false;
    };
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Try again in 15 minutes.'
            : response.status === 401
              ? 'The email or password is incorrect.'
              : 'Sign-in is unavailable. Check the server configuration and database connection.',
        );
        return;
      }
      window.location.replace('/admin/portal');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <a href="/en" className="admin-brand">
        DentalFlow
      </a>
      <h1>Clinic owner sign in</h1>
      <p>Manage Google access, scheduled jobs, and recovery records.</p>
      {checking ? <LoadingIndicator label="Checking your session…" /> : <form onSubmit={submit}>
        <label>
          Email
          <input disabled={busy} name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <label>
          Password
          <input disabled={busy} name="password" type="password" autoComplete="current-password" required maxLength={1024} />
        </label>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        <button disabled={busy}>{busy ? <LoadingIndicator inline label="Signing in…" /> : 'Sign in'}</button>
      </form>}
    </main>
  );
}
