'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, ClinicTimezone } from './client';
const links = [
  ['/admin/portal', 'Overview'],
  ['/admin/portal/integrations', 'Integrations'],
  ['/admin/portal/cron', 'Scheduled jobs'],
  ['/admin/portal/operations', 'Recovery records'],
];
export function Shell({ children, timezone }: { children: React.ReactNode; timezone: string }) {
  const pathname = usePathname(),
    [error, setError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        void adminFetch('/api/admin/session').catch(() => undefined);
    }, 600_000);
    return () => clearInterval(timer);
  }, []);
  const logout = async () => {
    try {
      await adminFetch('/api/admin/auth/logout', { method: 'POST' });
      window.location.assign('/admin/login');
    } catch {
      setError('Could not sign out. Please try again.');
    }
  };
  return (
    <ClinicTimezone.Provider value={timezone}>
      <header className="admin-header">
        <Link href="/admin/portal" className="admin-brand">
          DentalFlow <span>Clinic administration</span>
        </Link>
        <button className="secondary" onClick={() => void logout()}>
          Sign out
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
