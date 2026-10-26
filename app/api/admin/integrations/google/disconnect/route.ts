import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { disconnect } from '@/lib/server/google/oauth';
export function POST(request: Request) {
  return adminApi(request, true, async () => {
    await disconnect();
    return { ok: true };
  });
}
