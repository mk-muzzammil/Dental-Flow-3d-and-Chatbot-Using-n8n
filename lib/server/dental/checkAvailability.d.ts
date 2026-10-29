import type { HoldInput, Hold, Row, Doctor, BusyResponse } from './types';
export function checkAvailability(
  input: HoldInput,
  data: Row[][],
  doctors: { eligible: Doctor[] },
  freeBusy: BusyResponse,
): Hold;
