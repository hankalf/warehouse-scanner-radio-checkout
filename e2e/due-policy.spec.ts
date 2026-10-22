import { test, expect } from "@playwright/test";
import { enterPin, signIn, PIN, prisma, resetDevice, kioskTile, device, statusOf } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setDueHours(type: "SCANNER" | "RADIO", hours: number) {
  const key = `due.${type}.hours`;
  const value = String(hours);
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

// Due times come from the per-type checkout policy: N hours after checkout.
test("checkout stamps a due time N hours out, per device type", async ({ page }) => {
  await resetDevice("SCANNER", "11");
  await resetDevice("RADIO", "11");
  await setDueHours("SCANNER", 10);
  await setDueHours("RADIO", 36);

  for (const type of ["SCANNER", "RADIO"] as const) {
    await page.goto("/kiosk");
    await kioskTile(page, type, "11").click();
    await enterPin(page, PIN.operator);
    await page.getByRole("button", { name: /Siguiente/ }).click();
    // The confirm screen shows the due-back time before anything changes.
    await expect(page.getByText(/Due back/)).toBeVisible();
    await page.getByRole("button", { name: /Yes, that's me/ }).click();
    await expect.poll(() => statusOf(type, "11")).toBe("CHECKED_OUT");
  }

  const scanner = await device("SCANNER", "11");
  const radio = await device("RADIO", "11");
  const hoursOut = (d: { checkedOutAt: Date | null; dueAt: Date | null }) =>
    (d.dueAt!.getTime() - d.checkedOutAt!.getTime()) / 3600_000;
  expect(hoursOut(scanner!)).toBeCloseTo(10, 3);
  expect(hoursOut(radio!)).toBeCloseTo(36, 3);

  // The kiosk policy line reflects the setting.
  await page.goto("/kiosk");
  await expect(page.getByText(/Scanners:.*due 10 h after checkout/)).toBeVisible();
  await expect(page.getByText(/Radios:.*due 36 h after checkout/)).toBeVisible();

  await setDueHours("SCANNER", 12);
  await setDueHours("RADIO", 12);
  await resetDevice("SCANNER", "11");
  await resetDevice("RADIO", "11");
});

test("a supervisor can change the checkout policy in Admin → Advanced", async ({ page }) => {
  await signIn(page, PIN.supervisor);
  await page.goto("/admin");
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Scanners due hours").fill("14");
  await page.getByLabel("Radios due hours").fill("12");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Checkout policy saved.")).toBeVisible();
  await expect
    .poll(async () => (await prisma.setting.findUnique({ where: { key: "due.SCANNER.hours" } }))?.value)
    .toBe("14");
  await setDueHours("SCANNER", 12);
});
