import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeviceByTypeAndNumber } from "@/lib/data";
import {
  STATUS_META,
  ACTION_LABEL,
  TYPE_META,
  displayState,
  typeFromSlug,
  deviceLabel,
} from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ type: string; number: string }>;
}) {
  const { type: slug, number } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const device = await getDeviceByTypeAndNumber(type, number);
  if (!device) notFound();

  const state = displayState(device.status, device.dueAt);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-sky-700 underline">
        ← Back to fleet
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span aria-hidden>{TYPE_META[type].icon}</span>
            {deviceLabel(device.type, device.number)}
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${TYPE_META[type].badge}`}>
              {TYPE_META[type].label}
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[state].dot}`} />
            <span className="font-medium">{STATUS_META[state].label}</span>
          </div>
        </div>
        {device.checkedOutBy && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Currently held by {device.checkedOutBy.name}
            {device.dueAt && <> · due back {device.dueAt.toLocaleString()}</>}
          </p>
        )}
        {device.status === "DAMAGED" && device.damageNote && (
          <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
            <span className="font-semibold">Reported damage:</span> {device.damageNote}
            {device.damagePhoto && (
              <a href={device.damagePhoto} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={device.damagePhoto}
                  alt={`Damage on ${deviceLabel(device.type, device.number)}`}
                  className="max-h-48 w-auto rounded border border-rose-300 dark:border-rose-900"
                />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold mb-3">Lifecycle history</h2>
        {device.events.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm">No events yet.</p>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
            {device.events.map((e) => (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-slate-400" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                  <span className="text-xs text-slate-400">
                    {e.createdAt.toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  by {e.worker?.name ?? "—"}
                  {e.fromStatus && (
                    <span className="text-slate-400">
                      {" "}
                      · {e.fromStatus} → {e.toStatus}
                    </span>
                  )}
                </div>
                {e.note && (
                  <div className="text-sm text-slate-500 italic mt-0.5">“{e.note}”</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
