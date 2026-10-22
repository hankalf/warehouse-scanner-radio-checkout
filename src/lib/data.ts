import { prisma } from "./prisma";
import { DEVICE_TYPES, type DeviceType } from "./status";
import { DEFAULT_DUE_HOURS, clampDueHours, dueSettingKey, type DuePolicy } from "./schedule";

export type TeamsSettings = {
  enabled: boolean;
  webhookUrl: string;
  notifyDamaged: boolean;
  notifyOverdue: boolean;
  notifyCheckout: boolean;
  notifyCheckin: boolean;
  notifyInspected: boolean;
};

export const TEAMS_KEYS = [
  "teams.enabled",
  "teams.webhookUrl",
  "teams.notifyDamaged",
  "teams.notifyOverdue",
  "teams.notifyCheckout",
  "teams.notifyCheckin",
  "teams.notifyInspected",
] as const;

export async function getTeamsSettings(): Promise<TeamsSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...TEAMS_KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: map.get("teams.enabled") === "true",
    webhookUrl: map.get("teams.webhookUrl") ?? "",
    notifyDamaged: (map.get("teams.notifyDamaged") ?? "true") === "true",
    notifyOverdue: (map.get("teams.notifyOverdue") ?? "true") === "true",
    // Per-action alerts are off by default — they're chatty on a busy floor.
    notifyCheckout: map.get("teams.notifyCheckout") === "true",
    notifyCheckin: map.get("teams.notifyCheckin") === "true",
    notifyInspected: map.get("teams.notifyInspected") === "true",
  };
}

// How many hours after checkout each device type is due back.
export async function getDuePolicy(): Promise<DuePolicy> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: DEVICE_TYPES.map(dueSettingKey) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const policy = { ...DEFAULT_DUE_HOURS };
  for (const t of DEVICE_TYPES) {
    const raw = map.get(dueSettingKey(t));
    if (raw != null) policy[t] = clampDueHours(Number(raw), DEFAULT_DUE_HOURS[t]);
  }
  return policy;
}

export async function getDueHoursFor(type: DeviceType): Promise<number> {
  return (await getDuePolicy())[type];
}

// Optional company logo shown in the kiosk's top-left corner. Stored as a
// data: URL in Settings so no file hosting is needed.
export async function getLogoDataUrl(): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key: "branding.logoDataUrl" } });
  return s?.value ? s.value : null;
}

// When true, the shared kiosk is view-only until a supervisor unlocks it.
export async function getKioskLocked(): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key: "kioskLocked" } });
  return s?.value === "true";
}

// The whole fleet: scanners first, then radios, each in number order.
export async function getDevices() {
  return prisma.device.findMany({
    orderBy: [{ type: "desc" }, { sortKey: "asc" }], // "SCANNER" > "RADIO" alphabetically
    include: { checkedOutBy: { select: { name: true } } },
  });
}

export type DeviceWithHolder = Awaited<ReturnType<typeof getDevices>>[number];

export async function getDeviceByTypeAndNumber(type: DeviceType, number: string) {
  return prisma.device.findUnique({
    where: { type_number: { type, number } },
    include: {
      checkedOutBy: { select: { name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        include: { worker: { select: { name: true } } },
      },
    },
  });
}

export async function getWorkers() {
  return prisma.worker.findMany({ orderBy: { name: "asc" } });
}

export async function getRecentEvents(limit = 100) {
  return prisma.deviceEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      worker: { select: { name: true } },
      device: { select: { type: true, number: true } },
    },
  });
}

export async function getAllEventsForExport() {
  return prisma.deviceEvent.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      worker: { select: { name: true } },
      device: { select: { type: true, number: true } },
    },
  });
}
