import { test, expect } from "@playwright/test";
import { signIn, PIN, prisma, resetDevice, boardTile, statusOf, device } from "./helpers";

// A lead account is created on demand so this spec is self-contained.
const LEAD_PIN = "4444";

test.beforeAll(async () => {
  const { hashPin } = await import("../src/lib/crypto");
  const existing = await prisma.worker.findFirst({ where: { name: "Lee (Lead)" } });
  if (!existing) {
    await prisma.worker.create({
      data: { name: "Lee (Lead)", pin: hashPin(LEAD_PIN), roles: "LEAD", active: true },
    });
  }
});

test.afterAll(async () => {
  await prisma.worker.deleteMany({ where: { name: "Lee (Lead)" } });
  await prisma.$disconnect();
});

test("a lead gets a read-only admin panel with the fleet and the log", async ({ page }) => {
  await signIn(page, LEAD_PIN);

  await page.goto("/admin");
  // Visible: the fleet list and the audit log.
  await expect(page.getByRole("heading", { name: /Device fleet \(/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recent activity/ })).toBeVisible();
  await expect(page.getByText(/view-only/)).toBeVisible();
  // Hidden: everything that changes configuration.
  await expect(page.getByRole("heading", { name: "Add a device" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workers" })).toHaveCount(0);
  await expect(page.getByText("Advanced", { exact: true })).toHaveCount(0);
  // And no per-device editing.
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("a lead can run floor actions and clear a damaged device", async ({ page }) => {
  const T = "SCANNER";
  const N = "8";
  await resetDevice(T, N);
  await signIn(page, LEAD_PIN);

  // Operator capability.
  await boardTile(page, T, N).click();
  await page.getByRole("button", { name: /^Check out$/ }).click();
  await expect.poll(() => statusOf(T, N)).toBe("CHECKED_OUT");

  // Configuration is off-limits even though leads hold floor powers.
  await boardTile(page, T, N).click();
  await expect(page.getByText("Device type")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Damaged devices are the lead's call.
  const d = await device(T, N);
  await prisma.device.update({
    where: { id: d!.id },
    data: { status: "DAMAGED", damageNote: "Broken trigger", checkedOutById: null, dueAt: null },
  });
  await page.reload();
  await boardTile(page, T, N).click();
  await page.getByRole("button", { name: /Return to service \(reviewed\)/ }).click();
  await expect.poll(() => statusOf(T, N)).toBe("AVAILABLE");

  await resetDevice(T, N);
});

test("a supervisor manages devices but not employees or Teams, and can clear damage", async ({ page }) => {
  const T = "RADIO";
  const N = "7";
  await resetDevice(T, N);
  const d = await device(T, N);
  await prisma.device.update({
    where: { id: d!.id },
    data: { status: "DAMAGED", damageNote: "Dead battery" },
  });

  await signIn(page, PIN.supervisor);

  // Supervisors review damaged devices.
  await boardTile(page, T, N).click();
  await page.getByRole("button", { name: /Return to service/ }).click();
  await expect.poll(() => statusOf(T, N)).toBe("AVAILABLE");

  await page.goto("/admin");
  // Devices stay editable for supervisors…
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
  // …but employees and Teams settings are admin-only.
  await expect(page.getByRole("heading", { name: "Workers" })).toHaveCount(0);
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByText("Microsoft Teams notifications")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kiosk logo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checkout policy" })).toBeVisible();

  await resetDevice(T, N);
});

// Remove the test range along with its audit events (events reference devices).
async function dropTestRadios() {
  const ids = (
    await prisma.device.findMany({
      where: { type: "RADIO", sortKey: { gte: 91, lte: 93 } },
      select: { id: true },
    })
  ).map((d) => d.id);
  if (ids.length === 0) return;
  await prisma.deviceEvent.deleteMany({ where: { deviceId: { in: ids } } });
  await prisma.device.deleteMany({ where: { id: { in: ids } } });
}

test("a supervisor can add a numbered range of radios", async ({ page }) => {
  await dropTestRadios();
  await signIn(page, PIN.supervisor);
  await page.goto("/admin");

  await page.getByRole("button", { name: /Radio/ }).first().click();
  await page.getByLabel("Range from").fill("91");
  await page.getByLabel("Range to").fill("93");
  await page.getByRole("button", { name: "Add range" }).click();
  await expect(page.getByText("3 added.")).toBeVisible();
  await expect
    .poll(() => prisma.device.count({ where: { type: "RADIO", sortKey: { gte: 91, lte: 93 } } }))
    .toBe(3);

  // Scanner #1 and Radio #1 coexist: numbers are unique per type only.
  expect(await device("SCANNER", "1")).not.toBeNull();
  expect(await device("RADIO", "1")).not.toBeNull();

  await dropTestRadios();
});
