import { withLease } from "@/lib/server/operations/lease";
import { settingsImpact } from "@/lib/server/dental/settings-impact";
import { adminApi } from "@/lib/server/admin-api";
import { readJson } from "@/lib/server/http";
import { settings, type Settings } from "@/lib/server/google/settings";
import {
  storageProfile,
  validateConfiguration,
  type StorageProfile,
} from "@/lib/server/storage/profile";
import { collection } from "@/lib/server/db";
import { AppError } from "@/lib/server/config";
import { digest } from "@/lib/server/security";
import { validateEditorConfiguration } from "@/lib/server/storage/editor-validation";
import { audit } from "@/lib/server/auth";
export const runtime = "nodejs";
export function GET(request: Request) {
  return adminApi(request, false, async () => {
    const selected = await settings();
    const profile = await storageProfile(selected.sheetId);
    return profile
      ? {
          migrated: true,
          sheetId: selected.sheetId,
          version: digest(JSON.stringify(profile.configuration)),
          configuration: profile.configuration,
        }
      : { migrated: false, sheetId: selected.sheetId };
  });
}
export function PATCH(request: Request) {
  return adminApi(request, true, async () => {
    const selected = await settings();
    return withLease(`clinic-settings:${selected.sheetId}`, async () => {
      const profile = await storageProfile(selected.sheetId);
      if (!profile) throw new AppError("clinic_not_migrated", 409);
      const input = await readJson(request, 200_000);
      if (input.sheetId !== selected.sheetId)
        throw new AppError("clinic_selection_changed", 409);
      if (input.version !== digest(JSON.stringify(profile.configuration)))
        throw new AppError("configuration_changed_reload_before_saving", 409);
      const configuration = validateConfiguration(input.configuration);
      validateEditorConfiguration(configuration, profile.configuration);
      const impact = await settingsImpact(configuration);
      if (
        impact.warnings.length &&
        input.acknowledgement !== impact.acknowledgement
      )
        throw new AppError("future_booking_conflicts_review_required", 409);
      const result = await (
        await collection<StorageProfile>("clinic_configuration")
      ).updateOne(
        {
          _id: selected.sheetId,
          state: "active",
          updatedAt: profile.updatedAt,
        },
        { $set: { configuration, updatedAt: new Date() } },
      );
      if (!result.matchedCount)
        throw new AppError("configuration_changed_reload_before_saving", 409);
      await (await collection("clinic_cache")).deleteMany({});
      await (
        await collection<Settings>("app_settings")
      ).updateOne({ _id: "clinic" }, { $set: { ready: false } });
      await audit("clinic_configuration_updated");
      return { ok: true };
    });
  });
}

export function POST(request: Request) {
  return adminApi(request, true, async () => {
    const selected = await settings(),
      profile = await storageProfile(selected.sheetId),
      input = await readJson(request, 200000);
    if (!profile || input.sheetId !== selected.sheetId)
      throw new AppError("clinic_selection_changed", 409);
    const configuration = validateConfiguration(input.configuration);
    validateEditorConfiguration(configuration, profile.configuration);
    return settingsImpact(configuration);
  });
}
