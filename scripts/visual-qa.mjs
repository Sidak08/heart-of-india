import { chromium } from "playwright";
import seed from "../heart-of-india-menu.json" with { type: "json" };

const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";
const output = "artifacts/screenshots";
const viewports = [[320, 700], [375, 812], [390, 844], [430, 932], [768, 1024], [844, 390], [1024, 768], [1280, 800], [1366, 768], [1440, 900], [1920, 1080]];
const browser = await chromium.launch(); const context = await browser.newContext(); const page = await context.newPage();
const results = [];
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
for (const [width, height] of viewports) {
  await page.setViewportSize({ width, height }); await page.goto(`${baseURL}/menu`); await page.waitForLoadState("networkidle");
  const metrics = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  results.push({ width, height, ...metrics }); await page.screenshot({ path: `${output}/menu-${width}x${height}.png` });
}
const lines = seed.items.slice(0, 10).map((item, index) => ({ lineId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, itemId: item.id, quantity: index % 3 + 1, selections: {}, displayName: item.name, unitPriceCents: item.priceCents }));
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseURL}/menu`); await page.waitForTimeout(400); await page.evaluate((cartLines) => localStorage.setItem("heart-of-india-cart-v1", JSON.stringify({ version: 1, lines: cartLines })), lines); await page.reload(); await page.getByRole("button", { name: /Open cart, 19 items/ }).waitFor();
await page.getByLabel("Search the menu").fill("Saag (Chicken/Goat/Lamb)"); await page.getByRole("button", { name: /Choose options for Saag/ }).click(); await page.screenshot({ path: `${output}/item-sheet-390x844.png` }); await page.setViewportSize({ width: 1024, height: 768 }); if (!(await page.getByRole("dialog").isVisible())) throw new Error("Item dialog did not survive responsive resizing."); await page.screenshot({ path: `${output}/item-dialog-resized-1024x768.png` }); await page.keyboard.press("Escape");
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseURL}/cart`); await page.screenshot({ path: `${output}/cart-long-390x844.png`, fullPage: true }); await page.goto(`${baseURL}/checkout`); await page.getByText(/Online payment is not available yet/).waitFor(); await page.screenshot({ path: `${output}/checkout-390x844.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 }); const fieldChecks = []; for (const field of ["name", "email", "phone", "notes"]) { await page.locator(`#${field}`).focus(); await page.locator(`#${field}`).scrollIntoViewIfNeeded(); const box = await page.locator(`#${field}`).boundingBox(); fieldChecks.push({ field, reachable: Boolean(box && box.y >= 0 && box.y < 844) }); } if (fieldChecks.some((entry) => !entry.reachable)) throw new Error(`Checkout field was obstructed: ${JSON.stringify(fieldChecks)}`);
await page.setViewportSize({ width: 1440, height: 900 }); for (const route of ["", "/menu", "/about", "/cart", "/checkout"]) { await page.goto(`${baseURL}${route}`); await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${output}/${route.slice(1) || "home"}-1440x900.png`, fullPage: route === "" || route === "/about" }); }
await page.goto(`${baseURL}/menu`); await page.getByLabel("Search the menu").fill("Saag (Chicken/Goat/Lamb)"); await page.getByRole("button", { name: /Choose options for Saag/ }).click(); await page.screenshot({ path: `${output}/item-dialog-1440x900.png` });
const functionalErrors = [...browserErrors]; browserErrors.length = 0;
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseURL}/order/11111111-1111-4111-8111-111111111111?cancelled=1`); await page.waitForTimeout(800); await page.screenshot({ path: `${output}/confirmation-cancelled-390x844.png`, fullPage: true });
const expectedUnauthorizedStatusErrors = [...browserErrors]; browserErrors.length = 0;
await page.setViewportSize({ width: 320, height: 700 }); await page.goto(`${baseURL}/menu`); await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; }); const enlarged = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })); await page.screenshot({ path: `${output}/menu-enlarged-text-320x700.png` }); if (enlarged.documentWidth > enlarged.clientWidth) throw new Error(`Enlarged text caused page overflow: ${JSON.stringify(enlarged)}`);
const unexpectedBrowserErrors = [...functionalErrors, ...browserErrors]; console.log(JSON.stringify({ layouts: results, checkoutFields: fieldChecks, enlargedText: enlarged, browserErrors: unexpectedBrowserErrors, expectedUnauthorizedStatusErrors }, null, 2)); await browser.close(); if (unexpectedBrowserErrors.length) process.exitCode = 1;
