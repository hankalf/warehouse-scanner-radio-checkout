import { test, expect } from "@playwright/test";
import { enterPin, PIN, prisma } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("kiosk is open, bilingual, and groups scanners and radios", async ({ page }) => {
  await page.goto("/kiosk");
  await expect(
    page.getByRole("heading", { name: "Scanner & Radio Check-in / Checkout" })
  ).toBeVisible();
  // Spanish instructions are present underneath the English ones.
  await expect(page.getByText(/Toque un dispositivo/)).toBeVisible();
  // One group heading per device type.
  await expect(page.getByRole("heading", { name: /Scanners/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Radios/ })).toBeVisible();
});

test("the fleet board is gated to admins/supervisors", async ({ page }) => {
  await page.goto("/");
  // Signed out → sign-in overlay.
  await expect(page.getByText(/Admins .* enter your PIN/i)).toBeVisible();

  // An operator PIN is accepted but denied the management board.
  await enterPin(page, PIN.operator);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText(/for admins .* supervisors/i)).toBeVisible();
});

test("an admin PIN opens the fleet board", async ({ page }) => {
  await page.goto("/");
  await enterPin(page, PIN.admin);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "Device fleet" })).toBeVisible();
});
