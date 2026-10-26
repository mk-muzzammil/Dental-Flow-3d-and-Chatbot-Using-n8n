import type { HoldInput, Hold, Row, DoctorChoice, BusyResponse } from './types';
export function checkAvailability(
  input: HoldInput,
  data: Row[][],
  doctors: DoctorChoice,
  freeBusy: BusyResponse,
): Hold;
