import type { Metadata } from 'next';
import './admin.css';
import { Suspense } from 'react';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
export const metadata: Metadata = {
  title: 'DentalFlow · Clinic administration',
  robots: { index: false, follow: false },
};
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Suspense fallback={<LoadingIndicator page label="Loading administration…" />}>{children}</Suspense></body>
    </html>
  );
}
