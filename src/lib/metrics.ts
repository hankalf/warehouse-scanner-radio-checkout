import { prisma } from "./prisma";
import { isOverdue, deviceLabel } from "./status";

// End-of-shift sweep: every device still checked out, soonest-due first.
export async function getCheckedOutReport() {
  const devices = await prisma.device.findMany({
    where: { status: "CHECKED_OUT" },
    include: { checkedOutBy: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  });
  return devices.map((d) => ({
    id: d.id,
    type: d.type,
    number: d.number,
    label: deviceLabel(d.type, d.number),
    holder: d.checkedOutBy?.name ?? "—",
    checkedOutAt: d.checkedOutAt,
    dueAt: d.dueAt,
    overdue: isOverdue(d.status, d.dueAt),
  }));
}

export type FleetMetrics = {
  totalCheckouts: number;
  inspections: number;
  damageReports: number;
  cyclesMeasured: number;
  avgTurnaroundMs: number | null; // return -> inspected & back in service
  mostUsed: { label: string; count: number }[];
};

// Aggregate the immutable event log into fleet-level metrics.
export async function getMetrics(): Promise<FleetMetrics> {
  const [events, devices] = await Promise.all([
    prisma.deviceEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: { deviceId: true, action: true, createdAt: true },
    }),
    prisma.device.findMany({ select: { id: true, type: true, number: true } }),
  ]);
  const labelById = new Map(devices.map((d) => [d.id, deviceLabel(d.type, d.number)]));

  const checkoutCount = new Map<number, number>();
  let inspections = 0;
  let damageReports = 0;
  const lastReturn = new Map<number, Date>();
  const turnarounds: number[] = [];

  for (const e of events) {
    switch (e.action) {
      case "CHECKOUT":
        checkoutCount.set(e.deviceId, (checkoutCount.get(e.deviceId) ?? 0) + 1);
        break;
      case "RETURN":
        // Start of the inspection turnaround clock for this device.
        lastReturn.set(e.deviceId, e.createdAt);
        break;
      case "DAMAGE":
        damageReports++;
        lastReturn.delete(e.deviceId);
        break;
      case "INSPECT": {
        inspections++;
        const r = lastReturn.get(e.deviceId);
        if (r) {
          turnarounds.push(e.createdAt.getTime() - r.getTime());
          lastReturn.delete(e.deviceId);
        }
        break;
      }
    }
  }

  const totalCheckouts = [...checkoutCount.values()].reduce((a, b) => a + b, 0);
  const avgTurnaroundMs = turnarounds.length
    ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
    : null;
  const mostUsed = [...checkoutCount.entries()]
    .map(([id, count]) => ({ label: labelById.get(id) ?? `#${id}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalCheckouts,
    inspections,
    damageReports,
    cyclesMeasured: turnarounds.length,
    avgTurnaroundMs,
    mostUsed,
  };
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}
