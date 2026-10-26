import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { startConnection } from '@/lib/server/google/oauth';
export function POST(request: Request) {
  return adminApi(request, true, async (session) => ({ url: await startConnection(session._id) }));
}
