import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { collection } from '@/lib/server/db';
import { type Operation } from '@/lib/server/operations/journal';
export function GET(request: Request) {
  return adminApi(request, false, async () => ({
    operations: await (
      await collection<Operation>('operation_journal')
    )
      .find(
        { status: { $in: ['failed', 'uncertain', 'running'] } },
        {
          projection: {
            _id: 1,
            type: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            error: 1,
            bookingIdentity: 1,
            reference: 1,
          },
        },
      )
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray(),
  }));
}
