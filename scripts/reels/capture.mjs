// 앱 화면 캡처 — .app-frame 요소를 deviceScaleFactor 2 로 촬영
// usage: node capture.mjs <outDir> <shots: name=urlQuery[,click=텍스트]...>
import { createRequire } from "module";
const require = createRequire("/Users/hyunwoo/Developer/Projects/newsetter/package.json");
const { chromium } = require("playwright");

const OUT = process.argv[2];
const BASE = "http://localhost:3000";
const SHOTS = JSON.parse(process.argv[3]); // [{name, s, extra?, clickText?, clickLast?, scroll?, toggleGrowth?}]

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 720, height: 1400 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
await page.addInitScript(() => {
  setInterval(() => {
    document.querySelectorAll("nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher").forEach((e) => e.remove());
  }, 200);
});

// 로그인
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const dev = page.getByText("개발자 모드로 계속", { exact: true });
if (await dev.count()) { await dev.first().click(); await page.waitForTimeout(2500); }

for (const shot of SHOTS) {
  const q = shot.s ? `/?s=${shot.s}${shot.extra ?? ""}` : "/";
  await page.goto(BASE + q, { waitUntil: "networkidle" });
  await page.waitForTimeout(shot.wait ?? 1800);
  if (shot.clickText) {
    const loc = page.getByText(shot.clickText, { exact: false });
    if (await loc.count()) { await (shot.clickLast ? loc.last() : loc.first()).click(); await page.waitForTimeout(1600); }
    else console.error("no clickable:", shot.clickText);
  }
  if (shot.clickText2) {
    const loc = page.getByText(shot.clickText2, { exact: false });
    if (await loc.count()) { await loc.first().click(); await page.waitForTimeout(1600); }
    else console.error("no clickable2:", shot.clickText2);
  }
  if (shot.scroll) await page.mouse.wheel(0, shot.scroll), await page.waitForTimeout(700);
  const frame = page.locator(".app-frame");
  await frame.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log("shot:", shot.name);
}
await browser.close();
console.log("done");
