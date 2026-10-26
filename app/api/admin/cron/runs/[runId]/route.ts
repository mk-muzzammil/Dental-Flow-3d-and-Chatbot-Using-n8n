import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { collection } from '@/lib/server/db';
import { AppError } from '@/lib/server/config';
import { type Run, reconcileHistory } from '@/lib/server/jobs/schedule';
export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  return adminApi(request, false, async () => {
    await reconcileHistory();
    const run = await (await collection<Run>('cron_runs')).findOne({ _id: runId });
    if (!run) throw new AppError('run_not_found', 404);
    return { run };
  });
}
