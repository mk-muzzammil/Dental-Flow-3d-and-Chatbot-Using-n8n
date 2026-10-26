import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { randomUUID } from 'node:crypto';
import { runJob } from '@/lib/server/jobs/runner';
import { audit } from '@/lib/server/auth';
import { AppError } from '@/lib/server/config';
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return adminApi(request, true, async () => {
    const key = request.headers.get('idempotency-key') || randomUUID();
    if (!/^[\w-]{16,120}$/.test(key)) throw new AppError('bad_idempotency_key', 400);
    await audit('manual_job_trigger', { jobId });
    return runJob(jobId, { source: 'manual', provider: 'admin', key }, request.signal);
  });
}
