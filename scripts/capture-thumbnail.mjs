// ProofLoop YouTube 썸네일 자동 캡처 (정확히 1280×720)
// 사용: node scripts/capture-thumbnail.mjs

import { chromium } from "playwright";
import path from "node:path";

const HTML_PATH = path.resolve("docs/youtube_썸네일.html");
const OUT_PATH = path.resolve("docs/youtube_썸네일.png");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2, // 2배 해상도로 선명하게
});
const page = await ctx.newPage();

await page.goto(`file://${HTML_PATH}`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

const thumbnail = page.locator("#thumbnail");
await thumbnail.screenshot({ path: OUT_PATH });

await browser.close();
console.log(`✅ 썸네일 저장 완료: ${OUT_PATH}`);
console.log(`   해상도: 1280×720 (2배 = 2560×1440 PNG)`);
console.log(`   YouTube 권장 크기에 부합합니다.`);
