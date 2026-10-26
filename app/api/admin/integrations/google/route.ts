import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { connectionStatus } from '@/lib/server/google/oauth';
export function GET(request: Request) {
  return adminApi(request, false, () => connectionStatus());
}
