import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { checkIntegration } from '@/lib/server/google/check';
import { deadline } from '@/lib/server/config';
export function POST(request: Request) {
  return adminApi(request, true, () => checkIntegration(deadline(25_000, request.signal)));
}
