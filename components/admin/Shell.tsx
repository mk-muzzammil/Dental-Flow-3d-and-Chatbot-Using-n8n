'use client';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, ClinicTimezone } from './client';
const links = [
  ['/admin/portal', 'Overview'],
  ['/admin/portal/clinic', 'Clinic management'],
  ['/admin/portal/integrations', 'Integrations'],
  ['/admin/portal/cron', 'Scheduled jobs'],
  ['/admin/portal/operations', 'Recovery records'],
];
export function Shell({ children, timezone }: { children: React.ReactNode; timezone: string }) {
  const pathname = usePathname(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setRefreshing(true);
        void adminFetch('/api/admin/session').catch(() => undefined).finally(() => { if (active) setRefreshing(false); });
      }
    }, 600_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const logout = async () => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/auth/logout', { method: 'POST' });
      window.location.assign('/admin/login');
    } catch {
      setError('Could not sign out. Please try again.');
      setBusy(false);
    }
  };
  return (
    <ClinicTimezone.Provider value={timezone}>
      <header className="admin-header">
        <Link href="/admin/portal" className="admin-brand">
          DentalFlow <span>Clinic administration</span>
        </Link>
        {refreshing && <LoadingIndicator inline label="Checking session…" />}
        <button className="secondary" disabled={busy} onClick={() => void logout()}>
          {busy ? <LoadingIndicator inline label="Signing out…" /> : "Sign out"}
        </button>
      </header>
      <div className="admin-frame">
        <nav aria-label="Administration">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          <a href="/en">Open website ↗</a>
        </nav>
        <main>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </ClinicTimezone.Provider>
  );
}
