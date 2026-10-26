import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { finishConnection } from '@/lib/server/google/oauth';
import { appUrl } from '@/lib/server/config';
import { failure } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (request.nextUrl.searchParams.has('error'))
      return NextResponse.redirect(`${appUrl()}/admin/portal/integrations?connection=denied`);
    await finishConnection(
      session._id,
      request.nextUrl.searchParams.get('state') || '',
      request.nextUrl.searchParams.get('code') || '',
    );
    return NextResponse.redirect(`${appUrl()}/admin/portal/integrations?connection=connected`);
  } catch (error) {
    return failure(error);
  }
}
