import { test, expect } from "@playwright/test";
import { enterPin, PIN, prisma, resetDevice, kioskTile, boardTile, statusOf, device } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

// One operator round-trip plus a tech inspection on the kiosk: AVAILABLE →
// CHECKED_OUT → RETURNED → AVAILABLE, with the "Good" checklist path.
test("kiosk lifecycle: checkout, holder shown, check in, inspect good", async ({ page }) => {
  const T = "SCANNER";
  const N = "14";
  await resetDevice(T, N);

  // Check out as an operator.
  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.operator);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes, that's me/ }).click();

  await expect.poll(() => statusOf(T, N)).toBe("CHECKED_OUT");

  // The holder's name shows on the tile.
  await page.goto("/kiosk");
  await expect(kioskTile(page, T, N)).toContainText(/Olivia/);

  // Check it back in (→ RETURNED).
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.operator);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes, that's me/ }).click();
  await expect.poll(() => statusOf(T, N)).toBe("RETURNED");

  // Tech: on charger + inspected + good → back to AVAILABLE.
  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.tech);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes — continue/ }).click();
  await page.getByRole("button", { name: "Yes / Sí" }).first().click();
  await page.getByRole("button", { name: "Yes / Sí" }).nth(1).click();
  await page.getByRole("button", { name: "Good / Bueno" }).click();
  await page.getByRole("button", { name: /Submit/ }).click();

  await expect.poll(() => statusOf(T, N)).toBe("AVAILABLE");

  // The audit trail recorded the whole cycle.
  const d = await device(T, N);
  const events = await prisma.deviceEvent.findMany({ where: { deviceId: d!.id }, orderBy: { id: "asc" } });
  expect(events.slice(-3).map((e) => e.action)).toEqual(["CHECKOUT", "RETURN", "INSPECT"]);
});

// Only the holder (or an admin) can return a device.
test("someone else cannot return a device they didn't check out", async ({ page }) => {
  const T = "RADIO";
  const N = "14";
  await resetDevice(T, N);

  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.operator);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes, that's me/ }).click();
  await expect.poll(() => statusOf(T, N)).toBe("CHECKED_OUT");

  // The supervisor holds no OPERATOR role at all, so identify refuses up front.
  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.supervisor);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await expect(page.getByText(/requires the OPERATOR role/)).toBeVisible();

  await resetDevice(T, N);
});

// The damaged path: a tech flags damage, the device is held, and only a
// supervisor/lead/admin can return it to service.
test("damaged device requires a supervisor to return", async ({ page }) => {
  const T = "SCANNER";
  const N = "13";
  await resetDevice(T, N);

  // Drive to RETURNED (checkout then check in).
  for (let i = 0; i < 2; i++) {
    await page.goto("/kiosk");
    await kioskTile(page, T, N).click();
    await enterPin(page, PIN.operator);
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Yes, that's me/ }).click();
    await page.waitForTimeout(300);
  }
  await expect.poll(() => statusOf(T, N)).toBe("RETURNED");

  // The tech flags it damaged with a reason.
  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.tech);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes — continue/ }).click();
  await page.getByRole("button", { name: "Yes / Sí" }).first().click();
  await page.getByRole("button", { name: "Yes / Sí" }).nth(1).click();
  await page.getByRole("button", { name: /Damaged/ }).click();
  await page.getByPlaceholder(/Describe the damage/).fill("Cracked screen");
  await page.getByRole("button", { name: /Submit/ }).click();

  await expect.poll(() => statusOf(T, N)).toBe("DAMAGED");

  // On the kiosk it's now hands-off.
  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await expect(page.getByText(/a supervisor will review it/)).toBeVisible();
  await page.keyboard.press("Escape").catch(() => {});

  // An admin returns it to service from the board.
  await page.goto("/");
  await enterPin(page, PIN.admin);
  await page.getByRole("button", { name: "Enter" }).click();
  await boardTile(page, T, N).click();
  await expect(page.getByText(/Reported damage/)).toBeVisible();
  await expect(page.getByText("Cracked screen")).toBeVisible();
  await page.getByRole("button", { name: /Return to service \(reviewed\)/ }).click();

  await expect.poll(() => statusOf(T, N)).toBe("AVAILABLE");
});

// A tech must answer "on charger" AND "inspected" with Yes for a Good result.
test("inspection refuses to return a device that isn't on the charger", async ({ page }) => {
  const T = "RADIO";
  const N = "13";
  await resetDevice(T, N);
  const d = await device(T, N);
  await prisma.device.update({ where: { id: d!.id }, data: { status: "RETURNED" } });

  await page.goto("/kiosk");
  await kioskTile(page, T, N).click();
  await enterPin(page, PIN.tech);
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByRole("button", { name: /Yes — continue/ }).click();
  await page.getByRole("button", { name: "No", exact: true }).first().click(); // not on charger
  await page.getByRole("button", { name: "Yes / Sí" }).nth(1).click();
  await page.getByRole("button", { name: "Good / Bueno" }).click();
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.getByText(/must be on the charger and inspected/)).toBeVisible();
  expect(await statusOf(T, N)).toBe("RETURNED");

  await resetDevice(T, N);
});
