// 국내 5사 LLM 연결 스모크 테스트.
// .env.local을 읽어 키가 채워진 provider만 실제 호출하고, 키 값은 절대 출력하지 않는다.
// 사용: node scripts/smoke-test-models.mjs
import { readFileSync } from "node:fs";

const env = {};
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
} catch (e) {
  console.error("Could not read .env.local:", e.message);
  process.exit(1);
}

// 앱의 createOpenAICompatProvider와 동일한 호출 형태 (Bearer + /chat/completions)
const PROVIDERS = [
  { label: "LG EXAONE", key: env.FRIENDLI_API_KEY, baseUrl: env.FRIENDLI_BASE_URL || "https://api.friendli.ai/dedicated/v1", model: env.FRIENDLI_MODEL, extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  { label: "Upstage Solar", key: env.UPSTAGE_API_KEY, baseUrl: env.UPSTAGE_BASE_URL || "https://api.upstage.ai/v1/solar", model: env.UPSTAGE_MODEL || "solar-pro" },
  { label: "KT Mi:dm", key: env.KT_API_KEY, baseUrl: env.KT_BASE_URL || "https://api.friendli.ai/serverless/v1", model: env.KT_MODEL || "K-intelligence/Midm-2.0-Base-Instruct" },
  { label: "SKT A.X K1", key: env.SKT_API_KEY, baseUrl: env.SKT_BASE_URL || "https://api.platform.a.x/v1", model: env.SKT_MODEL || "ax-k1" },
];

const PROMPT = "한 문장으로 너 자신을 소개해줘.";

async function test(p) {
  if (!p.key) return { label: p.label, status: "⏭️  SKIP (.env.local에 키 없음)" };
  const endpoint = `${p.baseUrl.replace(/\/$/, "")}/chat/completions`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      // 추론(reasoning) 모델은 사고 과정에 토큰을 쓰므로 넉넉히 준다
      body: JSON.stringify({ model: p.model, messages: [{ role: "user", content: PROMPT }], temperature: 0.3, max_tokens: 1024, ...(p.extraBody ?? {}) }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " ");
      return { label: p.label, status: `❌ HTTP ${res.status}`, detail };
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message ?? {};
    const content = (msg.content ?? "").trim();
    const reasoning = (msg.reasoning_content ?? "").trim();
    if (content) return { label: p.label, status: "✅ OK", detail: content.slice(0, 80).replace(/\s+/g, " ") };
    if (reasoning) return { label: p.label, status: "⚠️  content 빔 (추론모델: reasoning만 옴 → 토큰부족)", detail: reasoning.slice(0, 60).replace(/\s+/g, " ") };
    return { label: p.label, status: "⚠️  빈 응답", detail: "" };
  } catch (e) {
    return { label: p.label, status: "❌ 호출 실패", detail: e.message };
  }
}

const results = await Promise.all(PROVIDERS.map(test));
console.log("\n=== 국내 5사 LLM 스모크 테스트 ===\n");
for (const r of results) {
  console.log(`${r.label.padEnd(15)} ${r.status}${r.detail ? "\n                 ↳ " + r.detail : ""}`);
}
console.log("");
