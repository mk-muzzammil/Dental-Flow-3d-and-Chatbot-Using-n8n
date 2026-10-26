import { audit, clearSessionCookies, requireAdmin } from '@/lib/server/auth';
import { collection } from '@/lib/server/db';
import { failure, privateJson } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request, true);
    await (
      await collection<{ _id: string; revokedAt: Date }>('admin_sessions')
    ).updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    await audit('logout');
    const response = privateJson({ ok: true });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return failure(error);
  }
}
