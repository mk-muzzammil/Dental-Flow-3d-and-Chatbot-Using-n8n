import { login, setSessionCookies } from '@/lib/server/auth';
import { failure, privateJson, readJson, sameOrigin } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readJson(request);
    const data = await login(
      typeof body.email === 'string' ? body.email : '',
      typeof body.password === 'string' ? body.password : '',
      (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim(),
    );
    const response = privateJson({ ok: true });
    setSessionCookies(response, data);
    return response;
  } catch (error) {
    return failure(error);
  }
}
