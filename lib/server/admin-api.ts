import 'server-only';
import { requireAdmin, type AdminSession } from './auth';
import { failure, privateJson } from './http';
export async function adminApi(
  request: Request,
  mutation: boolean,
  handle: (session: AdminSession) => Promise<unknown>,
) {
  try {
    const session = await requireAdmin(request, mutation);
    return privateJson(await handle(session));
  } catch (error) {
    return failure(error);
  }
}
