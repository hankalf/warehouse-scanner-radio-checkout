import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";

// A single Prisma client shared across the e2e run. Tests use it to reset a
// device to a known state and to assert on the persisted result.
export const prisma = new PrismaClient();

// Default seeded PINs (see prisma/seed.ts).
export const PIN = {
  admin: "0000",
  operator: "1111",
  tech: "2222",
  supervisor: "3333",
} as const;

export type DeviceType = "SCANNER" | "RADIO";

export async function enterPin(page: Page, pin: string) {
  for (const d of pin.split("")) {
    await page.getByRole("button", { name: d, exact: true }).first().click();
  }
}

// Sign in on the management board and wait until the fleet is showing, so a
// following navigation (e.g. to /admin) carries the session cookie.
export async function signIn(page: Page, pin: string) {
  await page.goto("/");
  await enterPin(page, pin);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "Device fleet" })).toBeVisible();
}

export const device = (type: DeviceType, number: string) =>
  prisma.device.findUnique({ where: { type_number: { type, number } } });

export const statusOf = async (type: DeviceType, number: string) =>
  (await device(type, number))?.status;

// Put a device back to a clean AVAILABLE state so a test starts predictably.
export async function resetDevice(type: DeviceType, number: string) {
  await prisma.device.updateMany({
    where: { type, number },
    data: {
      status: "AVAILABLE",
      checkedOutById: null,
      checkedOutAt: null,
      dueAt: null,
      damageNote: null,
      damagePhoto: null,
      retiredAt: null,
    },
  });
}

const label = (type: DeviceType, number: string) =>
  `${type === "RADIO" ? "Radio" : "Scanner"} #${number}`;

// Both boards title their tiles "<Scanner|Radio> #<n> — <status>".
export const kioskTile = (page: Page, type: DeviceType, number: string) =>
  page.locator(`button[title^="${label(type, number)} —"]`).first();

export const boardTile = kioskTile;
