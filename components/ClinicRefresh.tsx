'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Refresh server-rendered clinic details and the chat provider together.
 * Router refresh retains the visitor's open chat and unsent form state. */
export function ClinicRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.hidden || pending || Date.now() - last < 10_000) return;
      last = Date.now();
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, pending]);
  return null;
}
