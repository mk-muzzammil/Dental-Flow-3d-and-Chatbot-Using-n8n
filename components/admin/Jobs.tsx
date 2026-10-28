'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { adminFetch, useAdminData, useClinicTime, displayAge } from './client';
export type RunView = {
  _id: string;
  jobId: string;
  status: string;
  startedAt: string;
  scheduledAt?: string;
  endedAt?: string;
  triggerSource: string;
  provider: string;
  durationMs?: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: { code: string; item?: string }[];
  configVersion: string;
  deployment: string;
};
export type JobView = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  plan: string;
  mode: string;
  nativeSchedulable: boolean;
  enabled: boolean;
  lastRun?: RunView;
  lastSuccess?: RunView;
  nextExpected?: string;
};
export function Jobs() {
  const { displayTime, timezone } = useClinicTime();
  const jobData = useAdminData<{ jobs: JobView[]; appMode: 'demo' | 'live' }>('/api/admin/cron/jobs', true);
  const [query, setQuery] = useState(''),
    [cursor, setCursor] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const runKey = useRef<string | null>(null);
  const history = useAdminData<{ runs: RunView[]; cursor: string | null }>(
    `/api/admin/cron/runs?${query}${cursor ? '&cursor=' + cursor : ''}`,
    true,
  );
  const run = async (id: string) => {
    setBusy(true);
    setMessage('Cleanup is running…');
    runKey.current ??= crypto.randomUUID();
    try {
      const result = await adminFetch<RunView>(`/api/admin/cron/${id}/run`, {
        method: 'POST',
        headers: { 'Idempotency-Key': runKey.current },
      });
      setMessage(
        `Run ${result.status}: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped.`,
      );
      runKey.current = null;
      jobData.reload();
      history.reload();
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : 'Run failed'}. Retrying uses the same request key.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const configure = async (provider: string) => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ scheduler: provider }),
      });
      jobData.reload();
      history.reload();
      setMessage('Scheduling state updated. Keep the hosting scheduler configuration in sync.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };
  const filter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      q = new URLSearchParams();
    for (const [key, value] of data) if (value) q.set(key, String(value));
    setQuery(q.toString());
    setCursor('');
  };
  return (
    <>
      <p className="eyebrow">AUTOMATION</p>
      <h1>Scheduled jobs</h1>
      <p className="muted">
        Native and manual invocations use the same handler. Times display in {timezone}.
      </p>
      <p className="muted">
        All registered website jobs appear below. For local testing, keep Scheduling state on Manual only
        and use Run now. Booking confirmations and cancellations run immediately when requested; they are
        not scheduled jobs.
      </p>
      {jobData.data?.appMode === 'demo' ? (
        <p role="status" className="notice">
          Demo mode is active. Jobs are listed, but running cleanup requires APP_MODE=live and a server
          restart. A live run updates the selected Google Sheet and calendars and may send expiry emails.
        </p>
      ) : null}
      {!jobData.data && !jobData.error ? <p>Loading registered jobs…</p> : null}
      {jobData.error || history.error ? (
        <p role="alert" className="error">
          {jobData.error || history.error}
        </p>
      ) : null}
      {jobData.data?.jobs.map((job) => (
        <section className="card" key={job.id}>
          <div className="card-heading">
            <h2>{job.name}</h2>
            <span className="badge">{job.mode}</span>
          </div>
          <p className="big">{displayAge(job.lastSuccess?.endedAt)}</p>
          <dl className="facts">
            <div>
              <dt>Intended schedule</dt>
              <dd>{job.cron === '*/10 * * * *' ? 'Every 10 minutes' : job.cron} · {job.timezone}</dd>
            </div>
            <div>
              <dt>Hosting plan</dt>
              <dd>
                {job.plan} · native {job.nativeSchedulable ? 'available' : 'unavailable'}
              </dd>
            </div>
            <div>
              <dt>Last actual run</dt>
              <dd>
                {displayTime(job.lastRun?.startedAt)} · {job.lastRun?.status || 'none'}
              </dd>
            </div>
            <div>
              <dt>Next expected</dt>
              <dd>
                {job.nextExpected ? displayTime(job.nextExpected) : 'Manual-only: no expected invocation'}
              </dd>
            </div>
          </dl>
          <div className="actions">
            <button disabled={busy || !job.enabled || jobData.data?.appMode !== 'live'} onClick={() => void run(job.id)}>
              {busy ? 'Working…' : 'Run now'}
            </button>
            <label>
              Scheduling state
              <select
                aria-label="Scheduling state"
                value={job.mode === 'native' ? 'vercel' : job.mode === 'external' ? 'external' : 'none'}
                disabled={busy}
                onChange={(event) => void configure(event.target.value)}
              >
                <option value="none">Manual only</option>
                {job.nativeSchedulable ? <option value="vercel">Native Vercel Cron</option> : null}
                <option value="external">External scheduler configured</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Selecting an external scheduler records its activation. Configure that scheduler and its separate
            secret before enabling it.
          </p>
        </section>
      ))}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      <section className="card">
        <h2>Execution history</h2>
        <form className="filters" onSubmit={filter}>
          <label>
            Job
            <select name="job">
              <option value="">All jobs</option>
              {jobData.data?.jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
            </select>
          </label>
          <label>
            Status
            <select name="status">
              <option value="">All statuses</option>
              {['success', 'failed', 'missed', 'running', 'skipped'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select name="source">
              <option value="">All sources</option>
              <option>manual</option>
              <option>scheduled</option>
            </select>
          </label>
          <label>
            From (UTC)
            <input type="date" name="from" />
          </label>
          <label>
            To (UTC)
            <input type="date" name="to" />
          </label>
          <button className="secondary">Apply filters</button>
        </form>
        <RunTable runs={history.data?.runs || []} />
        <div className="actions">
          {cursor ? (
            <button className="secondary" onClick={() => setCursor('')}>
              Newest
            </button>
          ) : null}
          {history.data?.cursor ? (
            <button className="secondary" onClick={() => setCursor(history.data!.cursor!)}>
              Older runs
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
export function RunTable({ runs }: { runs: RunView[] }) {
  const { displayTime, timezone } = useClinicTime();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Scheduled / started</th>
            <th>Status</th>
            <th>Source / provider</th>
            <th>Duration</th>
            <th>Processed / succeeded / failed</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {runs.length ? (
            runs.map((run) => (
              <tr key={run._id}>
                <td>
                  {run.scheduledAt ? displayTime(run.scheduledAt) : 'Manual'}
                  <small>{run.status === 'missed' ? 'Not started' : displayTime(run.startedAt)}</small>
                </td>
                <td>
                  <span className={`badge ${run.status}`}>{run.status}</span>
                </td>
                <td>
                  {run.triggerSource}
                  <small>{run.provider}</small>
                </td>
                <td>{run.durationMs === undefined ? '—' : `${(run.durationMs / 1000).toFixed(1)}s`}</td>
                <td>
                  {run.processed} / {run.succeeded} / {run.failed}
                </td>
                <td>
                  <Link href={`/admin/portal/cron/runs/${run._id}`}>View run</Link>
                  {run.errors[0] ? <small>{run.errors[0].code}</small> : null}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>No executions match these filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function RunDetail({ runId }: { runId: string }) {
  const { displayTime, timezone } = useClinicTime();
  const { data, error } = useAdminData<{ run: RunView }>(
      `/api/admin/cron/runs/${encodeURIComponent(runId)}`,
      true,
    ),
    run = data?.run;
  return (
    <>
      <Link href="/admin/portal/cron">← All executions</Link>
      <h1>Execution details</h1>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {run ? (
        <section className="card">
          <h2>{run.jobId}</h2>
          <RunTable runs={[run]} />
          <dl className="facts">
            <div>
              <dt>Run ID</dt>
              <dd>{run._id}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{displayTime(run.endedAt)}</dd>
            </div>
            <div>
              <dt>Skipped items</dt>
              <dd>{run.skipped}</dd>
            </div>
            <div>
              <dt>Configuration / deployment</dt>
              <dd>
                {run.configVersion} / {run.deployment || '—'}
              </dd>
            </div>
          </dl>
          <h3>Errors</h3>
          {run.errors.length ? (
            <ul>
              {run.errors.map((e, i) => (
                <li key={i}>
                  {e.item ? `${e.item}: ` : ''}
                  {e.code}
                </li>
              ))}
            </ul>
          ) : (
            <p>No errors recorded.</p>
          )}
          <p className="muted">Patient details and provider payloads are excluded from execution logs.</p>
        </section>
      ) : (
        <p>Loading execution…</p>
      )}
    </>
  );
}
