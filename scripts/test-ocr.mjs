// Upstage Document Parse 손글씨/수식 인식 테스트.
// 사용: node scripts/test-ocr.mjs <이미지경로> [--raw]
//   예) node scripts/test-ocr.mjs ./손글씨수식.jpg
// .env.local의 UPSTAGE_API_KEY를 사용. 우리 앱과 동일한 호출(document-parse) + ocr=force.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const path = process.argv[2];
if (!path) {
  console.error("사용: node scripts/test-ocr.mjs <이미지경로> [--raw]");
  process.exit(1);
}
const showRaw = process.argv.includes("--raw");

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const key = env.UPSTAGE_API_KEY;
if (!key) {
  console.error("❌ .env.local에 UPSTAGE_API_KEY가 없습니다.");
  process.exit(1);
}

const buf = readFileSync(path);
const fd = new FormData();
fd.append("document", new Blob([buf]), basename(path));
fd.append("model", "document-parse");
fd.append("ocr", "force"); // 이미지에 OCR 강제 (손글씨 인식 시도)

console.log(`\n=== Upstage Document Parse: ${basename(path)} (${(buf.length / 1024).toFixed(0)}KB) ===`);
const res = await fetch("https://api.upstage.ai/v1/document-digitization", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
  body: fd,
  signal: AbortSignal.timeout(90000),
});
console.log("HTTP", res.status);
if (!res.ok) {
  console.log((await res.text()).slice(0, 500));
  process.exit(1);
}
const data = await res.json();
const els = data.elements ?? [];
console.log(`인식 요소 ${els.length}개:\n`);
for (const e of els) {
  const txt = (e.content?.markdown || e.content?.text || e.content?.html || "").replace(/\s+/g, " ").trim();
  console.log(`• [${e.category ?? "?"}] ${txt.slice(0, 220)}`);
}
if (showRaw) console.log("\n--- RAW (앞부분) ---\n", JSON.stringify(data, null, 2).slice(0, 4000));
console.log("\n(수식 category/내용이 얼마나 정확한지 확인하세요. 손글씨는 또박또박/흘림 둘 다 넣어보면 좋아요.)");
