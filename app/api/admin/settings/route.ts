import { adminApi } from '@/lib/server/admin-api';
export const runtime = 'nodejs';
import { settings, saveSettings } from '@/lib/server/google/settings';
import { readJson } from '@/lib/server/http';
import { configureScheduler } from '@/lib/server/jobs/schedule';
import { audit } from '@/lib/server/auth';
import { appMode, planTier } from '@/lib/server/config';
export function GET(request: Request) {
  return adminApi(request, false, async () => ({
    ...(await settings()),
    appMode: appMode(),
    plan: planTier(),
  }));
}
export function PATCH(request: Request) {
  return adminApi(request, true, async () => {
    const input = await readJson(request);
    if (input.sheetId !== undefined) await saveSettings(input);
    if (input.scheduler !== undefined) await configureScheduler(String(input.scheduler));
    await audit('settings_changed');
    return { ok: true };
  });
}
