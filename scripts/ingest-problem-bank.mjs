// AI Hub 수학 문제풀이 데이터 → Supabase problem_bank 적재 (few-shot 출제 참고용).
// 로컬에서만 실행. service_role 키 사용(RLS 우회). 데이터/키는 레포에 커밋 금지.
//
// 사용:
//   node scripts/ingest-problem-bank.mjs [Sample폴더경로]
//   기본 경로: /Users/user/Downloads/Sample
//
// .env.local 필요:
//   NEXT_PUBLIC_SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...   (Supabase 대시보드 → Project Settings → API → service_role)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const SAMPLE_DIR = process.argv[2] || "/Users/user/Downloads/Sample";

// ---- .env.local 로드 ----
const env = {};
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
} catch {
  console.error("❌ .env.local을 읽을 수 없습니다.");
  process.exit(1);
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  console.error("   service_role 키: Supabase 대시보드 → Project Settings → API → service_role secret");
  process.exit(1);
}

// ---- 헬퍼 ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function texts(d, className) {
  const out = [];
  for (const x of d.learning_data_info || []) {
    if (x.class_name === className) {
      for (const c of x.class_info_list || []) {
        const t = (c.text_description || "").trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function gradeKey(school = "", grade = "") {
  const lvl = school.includes("초") ? "초" : school.includes("중") ? "중" : school.includes("고") ? "고" : "";
  const num = (grade.match(/\d+/) || [""])[0];
  return lvl + num;
}

function pick2022(arr) {
  const v = (arr || []).map((s) => (s || "").trim()).filter(Boolean);
  return v[0] || "";
}

// ---- 변환 ----
const labelRoot = join(SAMPLE_DIR, "02.라벨링데이터");
let files;
try {
  files = walk(labelRoot);
} catch {
  console.error(`❌ ${labelRoot} 를 찾을 수 없습니다. Sample 폴더 경로를 인자로 주세요.`);
  process.exit(1);
}
console.log(`라벨 JSON ${files.length}개 스캔...`);

const rows = [];
let skipped = 0;
for (const f of files) {
  let d;
  try {
    d = JSON.parse(readFileSync(f, "utf8"));
  } catch {
    skipped++;
    continue;
  }
  const raw = d.raw_data_info || {};
  const src = d.source_data_info || {};
  const question = texts(d, "문항(텍스트)").join("\n");
  if (!question) {
    skipped++; // 이미지 전용 문제는 건너뜀
    continue;
  }
  const stdCode = pick2022(src["2022_achievement_standard"]) || pick2022(src["2015_achievement_standard"]);
  const codeMatch = stdCode.match(/\[[^\]]+\]/);
  rows.push({
    source_name: src.source_data_name || basename(f, ".json"),
    school: raw.school || null,
    grade: raw.grade || null,
    grade_key: gradeKey(raw.school, raw.grade),
    semester: raw.semester || null,
    subject: raw.subject || "수학",
    problem_type: src.types_of_problems || null,
    difficulty: src.level_of_difficulty || null,
    standard_code: codeMatch ? codeMatch[0] : null,
    standard_text: stdCode || null,
    question_text: question,
    answer_text: texts(d, "정답(텍스트)").join("\n") || null,
    solution_text: texts(d, "해설(텍스트)").join("\n") || null,
  });
}
console.log(`적재 대상 ${rows.length}개 (건너뜀 ${skipped}개: 텍스트 없음/파싱 실패)`);

// ---- 업로드 (upsert on source_name) ----
const endpoint = `${URL_}/rest/v1/problem_bank?on_conflict=source_name`;
const headers = {
  "Content-Type": "application/json",
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Prefer: "resolution=merge-duplicates,return=minimal",
};

let done = 0;
const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(batch) });
  if (!res.ok) {
    console.error(`❌ 배치 ${i / BATCH + 1} 실패 HTTP ${res.status}:`, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  done += batch.length;
  console.log(`  ${done}/${rows.length} 적재…`);
}

// 학년별 요약
const byGrade = {};
for (const r of rows) byGrade[r.grade_key] = (byGrade[r.grade_key] || 0) + 1;
console.log("\n✅ 완료. 학년키별 적재 수:");
for (const k of Object.keys(byGrade).sort()) console.log(`  ${k}: ${byGrade[k]}`);
