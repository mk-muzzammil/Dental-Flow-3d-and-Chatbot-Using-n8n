import { refreshSession, setSessionCookies } from '@/lib/server/auth';
import { failure, privateJson } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const data = await refreshSession(request);
    const response = privateJson({ ok: true });
    setSessionCookies(response, data);
    return response;
  } catch (error) {
    return failure(error);
  }
}
