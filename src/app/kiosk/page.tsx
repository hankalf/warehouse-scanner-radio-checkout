import { getDevices, getKioskLocked, getLogoDataUrl, getDuePolicy } from "@/lib/data";
import KioskBoard, { type KioskDevice } from "@/components/KioskBoard";

export const dynamic = "force-dynamic";

// Full-screen board for the shared floor tablet. Interactive unless a
// supervisor has locked it to view-only.
export default async function KioskPage() {
  const [devices, locked, logoDataUrl, duePolicy] = await Promise.all([
    getDevices(),
    getKioskLocked(),
    getLogoDataUrl(),
    getDuePolicy(),
  ]);
  const dto: KioskDevice[] = devices.map((d) => ({
    id: d.id,
    type: d.type,
    number: d.number,
    status: d.status,
    dueAtMs: d.dueAt ? d.dueAt.getTime() : null,
    holderName: d.checkedOutBy?.name ?? null,
  }));
  return (
    <KioskBoard devices={dto} locked={locked} logoDataUrl={logoDataUrl} duePolicy={duePolicy} />
  );
}
