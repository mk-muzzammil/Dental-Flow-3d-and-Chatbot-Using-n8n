import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/server/auth';
import { env } from '@/lib/server/config';
import { Shell } from '@/components/admin/Shell';
export const dynamic = 'force-dynamic';
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect('/admin/login');
  }
  return <Shell timezone={env('CLINIC_TIMEZONE', 'Asia/Karachi')}>{children}</Shell>;
}
