// 실제 ProofLoop dev 서버에서 페이지 캡처 → docs/captures/ 에 저장
// 사용: PROOFLOOP_EMAIL=...@... PROOFLOOP_PASSWORD=... node scripts/capture-screens.mjs

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PROOFLOOP_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.PROOFLOOP_EMAIL;
const PASSWORD = process.env.PROOFLOOP_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("❌ PROOFLOOP_EMAIL과 PROOFLOOP_PASSWORD 환경변수를 설정해주세요.");
  console.error("   예: PROOFLOOP_EMAIL=teacher@example.com PROOFLOOP_PASSWORD=... node scripts/capture-screens.mjs");
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), "docs", "captures");
await fs.mkdir(OUT_DIR, { recursive: true });

// ROLE 환경변수로 분기: 'teacher' (기본) 또는 'student'
const ROLE = (process.env.ROLE || "teacher").toLowerCase();

const TEACHER_PAGES = [
  { name: "02-analysis",        path: "/studio/analysis",        wait: 2000 },
  { name: "03-semester-report", path: "/studio/semester-report", wait: 1500, action: "generateSemester" },
  { name: "04-class-pattern",   path: "/studio/class-pattern",   wait: 1500, action: "generateClassPattern" },
  { name: "05-curriculum",      path: "/studio/curriculum",      wait: 1500, action: "generateCurriculum" },
  { name: "07-upload",          path: "/studio/upload",          wait: 1500, action: "demoUpload" },
  { name: "08-visual-diagram",  path: "/studio/visual",          wait: 1500, action: "generateDiagram" },
  { name: "09-visual-graph",    path: "/studio/visual",          wait: 1500, action: "generateGraph" },
];

const STUDENT_PAGES = [
  { name: "01-chat",            path: "/studio/chat",            wait: 2000 },
  { name: "06-reasoning",       path: "/studio/reasoning",       wait: 1500, action: "gradeReasoning" },
  { name: "07b-upload-student", path: "/studio/upload",          wait: 1500, action: "demoUpload" },
];

const PAGES = ROLE === "student" ? STUDENT_PAGES : TEACHER_PAGES;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

console.log(`→ 로그인 (${EMAIL})`);
await page.goto(`${BASE}/studio/login`);
await page.waitForLoadState("networkidle");

// 로그인 폼 입력
const emailInput = page.locator('input[type="email"]').first();
const passwordInput = page.locator('input[type="password"]').first();
await emailInput.fill(EMAIL);
await passwordInput.fill(PASSWORD);

// "로그인" 버튼 클릭 (회원가입이 디폴트일 수 있어서 텍스트 매칭)
const loginButton = page.getByRole("button", { name: /^(로그인|로그인하기)$/ }).first();
if (await loginButton.count() > 0) {
  await loginButton.click();
} else {
  // fallback: 첫 번째 submit 버튼
  await page.locator('button[type="submit"]').first().click();
}

// 로그인 후 리다이렉트 대기
try {
  await page.waitForURL(/\/studio\/(chat|analysis|semester-report)/, { timeout: 10000 });
} catch {
  console.error("❌ 로그인 후 리다이렉트가 일어나지 않음. 자격증명 확인 필요.");
  await page.screenshot({ path: path.join(OUT_DIR, "00-login-failed.png") });
  await browser.close();
  process.exit(1);
}

console.log("✓ 로그인 성공");

for (const cfg of PAGES) {
  console.log(`→ ${cfg.path}`);
  try {
    await page.goto(`${BASE}${cfg.path}`);
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await page.waitForTimeout(cfg.wait);

    // 액션 (각 페이지의 "생성" 버튼 클릭)
    if (cfg.action === "generateSemester") {
      const btn = page.getByRole("button", { name: /^리포트 생성/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(8000); }
    } else if (cfg.action === "generateClassPattern") {
      const btn = page.getByRole("button", { name: /^반 패턴 분석/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(8000); }
    } else if (cfg.action === "generateCurriculum") {
      const planBtn = page.getByRole("button", { name: /^계획 생성/ }).first();
      if (await planBtn.count() > 0) { await planBtn.click(); await page.waitForTimeout(8000); }
      const examBtn = page.getByRole("button", { name: /^시험 초안 생성/ }).first();
      if (await examBtn.count() > 0) { await examBtn.click(); await page.waitForTimeout(8000); }
    } else if (cfg.action === "gradeReasoning") {
      const btn = page.getByRole("button", { name: /^단계별 채점/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(8000); }
    } else if (cfg.action === "demoUpload") {
      const btn = page.getByRole("button", { name: /시연용 샘플로 즉시 보기/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(3000); }
    } else if (cfg.action === "generateDiagram") {
      const btn = page.getByRole("button", { name: /^시각자료 생성/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(3000); }
    } else if (cfg.action === "generateGraph") {
      const graphTab = page.getByRole("button", { name: /수학 그래프/ }).first();
      if (await graphTab.count() > 0) { await graphTab.click(); await page.waitForTimeout(500); }
      const btn = page.getByRole("button", { name: /^시각자료 생성/ }).first();
      if (await btn.count() > 0) { await btn.click(); await page.waitForTimeout(3000); }
    }

    // 캡처 (전체 페이지 길이로)
    const out = path.join(OUT_DIR, `${cfg.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  ✓ saved ${cfg.name}.png`);
  } catch (err) {
    console.error(`  ✗ failed ${cfg.name}: ${err.message}`);
  }
}

await browser.close();
console.log(`\n✅ 캡처 완료. ${OUT_DIR} 폴더 확인.`);
