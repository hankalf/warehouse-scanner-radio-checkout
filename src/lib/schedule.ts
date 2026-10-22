// Due-time rules. A device is due back a fixed number of hours after
// checkout — one shift plus some slack — so night shifts that cross midnight
// are handled the same as day shifts. The window is configurable per device
// type in Admin → Advanced → Checkout policy (stored in Settings).

import type { DeviceType } from "./status";

export const DEFAULT_DUE_HOURS: Record<DeviceType, number> = {
  SCANNER: 12,
  RADIO: 12,
};

export const MIN_DUE_HOURS = 1;
export const MAX_DUE_HOURS = 24 * 14; // two weeks

export type DuePolicy = Record<DeviceType, number>;

export function dueSettingKey(type: DeviceType): string {
  return `due.${type}.hours`;
}

export function clampDueHours(hours: number, fallback: number): number {
  if (!Number.isFinite(hours)) return fallback;
  return Math.min(MAX_DUE_HOURS, Math.max(MIN_DUE_HOURS, Math.round(hours)));
}

export function computeDueDate(hours: number, now: Date): Date {
  return new Date(now.getTime() + hours * 3600_000);
}

// "12 h" / "2 days" — for the kiosk policy line and admin readout.
export function formatDueWindow(hours: number): string {
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24} days`;
  if (hours === 24) return "24 h (1 day)";
  return `${hours} h`;
}
