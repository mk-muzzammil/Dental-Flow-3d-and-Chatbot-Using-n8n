'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const csrf = () =>
  document.cookie
    .split('; ')
    .find((x) => x.startsWith('df_admin_csrf='))
    ?.split('=')[1] || '';
let rotating: Promise<boolean> | undefined;
export async function refreshAccess() {
  if (!csrf()) return false;
  rotating ??= fetch('/api/admin/auth/refresh', { method: 'POST', headers: { 'X-CSRF-Token': csrf() } })
    .then(async (r) => {
      if (r.status === 409) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return true;
      }
      return r.ok;
    })
    .finally(() => {
      rotating = undefined;
    });
  return rotating;
}
export async function adminFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== 'GET') {
    headers.set('X-CSRF-Token', csrf());
    headers.set('Content-Type', 'application/json');
  }
  let response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (response.status === 401 && (await refreshAccess()))
    response = await fetch(url, { ...options, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({ error: 'invalid_response' }));
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/admin/login');
    throw new Error(data.error || 'Request failed');
  }
  return data as T;
}
export function useAdminData<T>(url: string, poll = false) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await adminFetch<T>(url, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load');
      } finally {
        pending = false;
      }
    };
    void load();
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = poll ? setInterval(visible, 15_000) : undefined;
    if (poll) document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [url, poll, version]);
  return { data, error, reload: () => setVersion((x) => x + 1) };
}
export const ClinicTimezone = createContext('Asia/Karachi');
export function useClinicTime() {
  const timezone = useContext(ClinicTimezone);
  return {
    timezone,
    displayTime: (value?: string | null) =>
      value
        ? new Date(value).toLocaleString('en-GB', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'Never',
  };
}
export const displayAge = (value?: string | null) =>
  value
    ? `${Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))} minutes ago`
    : 'No successful cleanup yet';
