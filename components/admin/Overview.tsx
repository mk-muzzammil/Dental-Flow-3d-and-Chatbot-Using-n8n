'use client';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import Link from 'next/link';
import { useAdminData, useClinicTime, displayAge } from './client';
import type { JobView } from './Jobs';
export function Overview() {
  const { displayTime, timezone } = useClinicTime();
  const settings = useAdminData<{ appMode: string; plan: string; ready?: boolean; checkedAt?: string }>(
    '/api/admin/settings',
  );
  const connection = useAdminData<{ status: string; email?: string }>('/api/admin/integrations/google');
  const jobs = useAdminData<{ jobs: JobView[] }>('/api/admin/cron/jobs', true);
  const errors = [settings.error, connection.error, jobs.error].filter(Boolean);
  if ((settings.loading && !settings.data) || (connection.loading && !connection.data) || (jobs.loading && !jobs.data))
    return <LoadingIndicator page label="Loading clinic overview…" />;
  return (
    <>
      <p className="eyebrow">CLINIC CONTROL</p>
      <h1>System overview</h1>
      <p className="muted">
        Appointments and doctor records sync with Google Sheets; clinic settings are managed here. All times below use {timezone}.
      </p>
      {errors.length ? (
        <p className="error" role="alert">
          {errors.join(' · ')}
        </p>
      ) : null}
      {(settings.loading || connection.loading || jobs.loading) && <LoadingIndicator label="Refreshing overview…" compact />}
      <div className="cards">
        <section className="card">
          <h2>Application</h2>
          <p className="big">{settings.data?.appMode || 'Unavailable'}</p>
          <p>Hosting plan: {settings.data?.plan || '—'}</p>
          <p>
            {settings.data?.appMode === 'demo'
              ? 'Visitors see simulated bookings.'
              : 'Live bookings use the connected clinic resources.'}
          </p>
        </section>
        <section className="card">
          <h2>Google connection</h2>
          <p className="big">{connection.data?.status || 'Unavailable'}</p>
          <p>{connection.data?.email || 'No owner account connected'}</p>
          <Link href="/admin/portal/integrations">Manage connection →</Link>
        </section>
        <section className="card">
          <h2>Integration checks</h2>
          <p className="big">{settings.data?.ready ? 'Passed' : 'Setup needed'}</p>
          <p>Last checked: {displayTime(settings.data?.checkedAt)}</p>
          <Link href="/admin/portal/integrations">Check Sheet and calendars →</Link>
        </section>
      </div>
      <section className="card">
        <h2>Expired-hold cleanup</h2>
        <p className="big">{displayAge(jobs.data?.jobs[0]?.lastSuccess?.endedAt)}</p>
        <p>Effective mode: {jobs.data?.jobs[0]?.mode || 'Unavailable'}</p>
        <p>Expired holds occupy calendar time until cleanup runs. An expired hold cannot be confirmed.</p>
        <Link href="/admin/portal/cron">Open jobs and run cleanup →</Link>
      </section>
    </>
  );
}
