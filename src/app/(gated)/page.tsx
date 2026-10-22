import { getDevices } from "@/lib/data";
import { getCurrentWorker } from "@/lib/session";
import { effectiveRoles, canManageConfig, canRetireDevices } from "@/lib/status";
import DeviceBoard, { type DeviceDTO } from "@/components/DeviceBoard";
import { Legend } from "@/components/Legend";

// Always render fresh — this is a live shared board.
export const dynamic = "force-dynamic";

// The (gated) layout guarantees a signed-in worker before this renders.
export default async function DashboardPage() {
  const [devices, worker] = await Promise.all([getDevices(), getCurrentWorker()]);
  const roles = effectiveRoles(worker?.roles ?? "");

  const dto: DeviceDTO[] = devices.map((d) => ({
    id: d.id,
    type: d.type,
    number: d.number,
    status: d.status,
    dueAtMs: d.dueAt ? d.dueAt.getTime() : null,
    checkedOutAtMs: d.checkedOutAt ? d.checkedOutAt.getTime() : null,
    holderName: d.checkedOutBy?.name ?? null,
    damageNote: d.damageNote ?? null,
    damagePhoto: d.damagePhoto ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Device fleet</h1>
        <p className="text-slate-500 text-sm">
          Tap a device to act on it. The board refreshes automatically.
        </p>
      </div>

      <DeviceBoard
        devices={dto}
        roles={roles}
        signedIn={true}
        canConfigure={canManageConfig(worker?.roles ?? "")}
        canRetire={canRetireDevices(worker?.roles ?? "")}
      />

      <Legend />
    </div>
  );
}
