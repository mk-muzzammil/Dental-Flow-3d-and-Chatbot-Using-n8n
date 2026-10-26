import { randomUUID } from 'node:crypto';
import { bearerValid } from '@/lib/server/security';
import { env, AppError } from '@/lib/server/config';
import { runJob } from '@/lib/server/jobs/runner';
import { requireAdmin, audit } from '@/lib/server/auth';
import { failure, privateJson } from '@/lib/server/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
async function invoke(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    let provider: 'vercel' | 'external' | 'cli' | 'admin';
    const scheduled = request.method === 'GET';
    if (bearerValid(request, env('CRON_SECRET'))) provider = scheduled ? 'vercel' : 'cli';
    else if (bearerValid(request, env('EXTERNAL_CRON_SECRET'))) provider = 'external';
    else {
      if (scheduled) throw new AppError('unauthorized', 401);
      await requireAdmin(request, true);
      provider = 'admin';
      await audit('manual_job_trigger', { jobId });
    }
    const key = request.headers.get('idempotency-key') || randomUUID();
    if (!/^[\w-]{16,120}$/.test(key)) throw new AppError('bad_idempotency_key', 400);
    if (!scheduled && provider !== 'admin') await audit('manual_job_trigger', { jobId, provider });
    const result = await runJob(
      jobId,
      { source: scheduled ? 'scheduled' : 'manual', provider, key },
      request.signal,
    );
    return privateJson(result, result.status === 'failed' ? 500 : 200);
  } catch (error) {
    return failure(error);
  }
}
export const GET = invoke;
export const POST = invoke;
