import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/crypto";

const prisma = new PrismaClient();

// The starter fleet: 20 scanners (#1–#20) and 20 radios (#1–#20). Numbers are
// unique per type. Add, renumber, or remove devices in Admin → Devices; the
// seed is idempotent and only ever ADDS missing devices.
const FLEET: { type: "SCANNER" | "RADIO"; count: number }[] = [
  { type: "SCANNER", count: 20 },
  { type: "RADIO", count: 20 },
];

// Starter workers so every role can be exercised immediately.
// PINs are only defaults — change them in the Admin screen.
const workers = [
  { name: "Admin", pin: "0000", roles: "ADMIN,OPERATOR,TECH,SUPERVISOR" },
  { name: "Olivia (Operator)", pin: "1111", roles: "OPERATOR" },
  { name: "Theo (Tech)", pin: "2222", roles: "TECH" },
  { name: "Sasha (Supervisor)", pin: "3333", roles: "SUPERVISOR" },
];

async function main() {
  // Devices — idempotent upsert so re-seeding never duplicates.
  for (const { type, count } of FLEET) {
    for (let n = 1; n <= count; n++) {
      await prisma.device.upsert({
        where: { type_number: { type, number: String(n) } },
        update: {},
        create: { type, number: String(n), sortKey: n, status: "AVAILABLE" },
      });
    }
  }

  // Workers.
  for (const w of workers) {
    const existing = await prisma.worker.findFirst({ where: { name: w.name } });
    if (existing) continue;
    await prisma.worker.create({
      data: { name: w.name, pin: hashPin(w.pin), roles: w.roles, active: true },
    });
  }

  // Checkout policy defaults (hours after checkout a device is due back).
  for (const type of ["SCANNER", "RADIO"] as const) {
    await prisma.setting.upsert({
      where: { key: `due.${type}.hours` },
      update: {},
      create: { key: `due.${type}.hours`, value: "12" },
    });
  }

  const deviceCount = await prisma.device.count();
  const workerCount = await prisma.worker.count();
  console.log(`Seed complete: ${deviceCount} devices, ${workerCount} workers.`);
  console.log("Default PINs — Admin 0000, Operator 1111, Tech 2222, Supervisor 3333");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
