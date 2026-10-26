import type { SlotConfig, Row, DoctorChoice, BusyResponse, SlotResult } from './types';
export function computeSlots(
  config: SlotConfig,
  data: Row[][],
  doctors: DoctorChoice,
  freeBusy: BusyResponse,
): SlotResult;
