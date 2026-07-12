// 슬라이드 HTML → PNG. usage: node render-slides.mjs <html경로> <outDir> [prefix]
import { createRequire } from "module";
const require = createRequire("/Users/hyunwoo/Developer/Projects/newsetter/package.json");
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";

const [, , htmlPath, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto("file://" + htmlPath);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
const slides = page.locator(".slide");
const n = await slides.count();
for (let i = 0; i < n; i++) {
  await slides.nth(i).scrollIntoViewIfNeeded();
  await slides.nth(i).screenshot({ path: `${outDir}/slide-0${i + 1}.png` });
  console.log("slide", i + 1, "/", n);
}
await browser.close();
console.log("rendered", n, "slides →", outDir);
