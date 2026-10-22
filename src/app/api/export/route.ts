import { getCurrentWorker } from "@/lib/session";
import { canAccessAdmin, deviceLabel } from "@/lib/status";
import { getAllEventsForExport } from "@/lib/data";

function csvCell(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const worker = await getCurrentWorker();
  if (!worker || !canAccessAdmin(worker.roles)) {
    return new Response("Forbidden — admins, supervisors, and leads only.", { status: 403 });
  }

  const events = await getAllEventsForExport();
  const header = ["Timestamp", "Device", "Type", "Number", "Action", "From", "To", "Worker", "Note"];
  const rows = events.map((e) =>
    [
      e.createdAt.toISOString(),
      deviceLabel(e.device.type, e.device.number),
      e.device.type,
      e.device.number,
      e.action,
      e.fromStatus ?? "",
      e.toStatus,
      e.worker?.name ?? "",
      e.note ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="device-audit-log.csv"`,
    },
  });
}
