'use client';
import { useState } from 'react';
import { adminFetch, useAdminData, useClinicTime } from './client';
export function Integrations() {
  const { displayTime } = useClinicTime();
  const connection = useAdminData<{ status: string; email?: string; scopes: string[]; updatedAt?: string }>(
    '/api/admin/integrations/google',
  );
  const settings = useAdminData<{ sheetId: string; calendarId: string; ready?: boolean }>(
    '/api/admin/settings',
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[]>([]);
  const action = async (kind: 'connect' | 'disconnect' | 'check') => {
    setBusy(true);
    setMessage('');
    try {
      const result = await adminFetch<{ url?: string; ready?: boolean; checks?: typeof checks }>(
        `/api/admin/integrations/google/${kind}`,
        { method: 'POST' },
      );
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setChecks(result.checks || []);
      setMessage(
        kind === 'disconnect'
          ? 'Google account disconnected.'
          : result.ready
            ? 'Integration checks passed.'
            : 'Some checks need attention.',
      );
      connection.reload();
      settings.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ sheetId: form.get('sheetId'), calendarId: form.get('calendarId') }),
      });
      setMessage('Resource selection saved. Run the access checks next.');
      settings.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="eyebrow">SETUP</p>
      <h1>Google integrations</h1>
      <p className="muted">
        Connect the clinic owner’s Google account for Sheets, Calendar, and sending confirmation emails from
        Gmail.
      </p>
      {connection.error || settings.error ? (
        <p className="error" role="alert">
          {connection.error || settings.error}
        </p>
      ) : null}
      <section className="card">
        <h2>Owner account</h2>
        <p>
          <span className="badge">{connection.data?.status || 'Loading…'}</span> {connection.data?.email}
        </p>
        <p>Updated {displayTime(connection.data?.updatedAt)}</p>
        <div className="actions">
          <button disabled={busy} onClick={() => void action('connect')}>
            {connection.data?.status === 'connected' ? 'Reconnect Google' : 'Connect Google'}
          </button>
          {connection.data?.status !== 'disconnected' ? (
            <button className="secondary" disabled={busy} onClick={() => void action('disconnect')}>
              Disconnect
            </button>
          ) : null}
        </div>
        <details>
          <summary>Granted permissions</summary>
          <ul>
            {connection.data?.scopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        </details>
        <p className="muted">
          Google consent apps in Testing mode may need reconnection after seven days. Use production consent
          configuration before clinic onboarding.
        </p>
      </section>
      <section className="card">
        <h2>Clinic resources</h2>
        {settings.data ? (
          <form key={settings.data.sheetId + settings.data.calendarId} onSubmit={save}>
            <label>
              Google Sheet ID
              <input name="sheetId" defaultValue={settings.data.sheetId} required maxLength={200} />
            </label>
            <label>
              Fallback Calendar ID
              <input name="calendarId" defaultValue={settings.data.calendarId} required maxLength={254} />
              <small>
                Used when the Doctors tab has no active calendars. Doctor calendars are configured below after migration; legacy workbooks use the Doctors tab.
              </small>
            </label>
            <div className="actions">
              <button disabled={busy}>Save resources</button>
              <button
                type="button"
                className="secondary"
                disabled={busy || connection.data?.status !== 'connected'}
                onClick={() => void action('check')}
              >
                Check access and structure
              </button>
            </div>
          </form>
        ) : (
          <p>Loading resource selection…</p>
        )}
      </section>
      <p><a href="/admin/portal/clinic">Manage clinic services, doctors and working hours →</a></p>
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {checks.length ? (
        <section className="card">
          <h2>Access checks</h2>
          <ul className="checks">
            {checks.map((c) => (
              <li key={c.name}>
                <strong>
                  {c.ok ? '✓' : '!'} {c.name}
                </strong>
                <span>{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
