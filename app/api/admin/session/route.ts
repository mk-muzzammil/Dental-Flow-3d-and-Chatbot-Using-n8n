import { requireAdmin, csrfFor } from '@/lib/server/auth';
import { failure, privateJson } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const session = await requireAdmin();
    return privateJson({ ok: true, csrf: csrfFor(session._id), expiresAt: session.expiresAt });
  } catch (error) {
    return failure(error);
  }
}
