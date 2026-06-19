/**
 * 시각자료 생성.
 *  - graph:   수식을 파싱해 함수 그래프를 그림 (규칙기반, 결정적)
 *  - diagram: 부력/전기회로/광합성은 전용 도해, 그 외 임의 개념은 5사 LLM이
 *             개념 핵심을 생성 → 개념맵으로 렌더 (LLM 없으면 빈 개념맵 폴백)
 *  - comic:   5사 LLM이 4컷 시나리오 생성 (없으면 템플릿)
 *  NC VARCO(멀티모달 이미지 생성)는 스펙 확정 시 별도 연동.
 */
import { getProvider } from "@/lib/ai";

export type VisualKind = "diagram" | "graph" | "comic";

export interface VisualResult {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  kind: VisualKind;
  prompt: string;
  svg?: string;
  panels?: Array<{ caption: string; emoji: string; text: string }>;
  description: string;
}

// ============================================================
// 공통 헬퍼
// ============================================================

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DIAGRAM_DEFS = `
  <defs>
    <marker id="redArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d25b4d"/></marker>
    <marker id="tealArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0b8f80"/></marker>
    <marker id="grayArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#576274"/></marker>
  </defs>`;

function svgFrame(title: string, subtitle: string, body: string, bg = "linear-gradient(180deg, #fff8ef 0%, #efe4d2 100%)"): string {
  return `
<svg viewBox="0 0 480 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:${bg};border-radius:16px;">
  ${DIAGRAM_DEFS}
  <text x="14" y="24" fill="#102033" font-size="16" font-weight="800" font-family="Pretendard">${escapeXml(title)}</text>
  <text x="14" y="44" fill="#576274" font-size="11" font-family="Pretendard">${escapeXml(subtitle)}</text>
  ${body}
</svg>`.trim();
}

// ============================================================
// 수학 그래프 (규칙기반)
// ============================================================

const GW = 480, GH = 320, GM = 30, X_MIN = -10, X_MAX = 10;

function coef(s: string | undefined): number {
  if (s === undefined || s === "" || s === "+") return 1;
  if (s === "-") return -1;
  return parseFloat(s);
}
function num(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace("+", ""));
}

function parseFormula(raw: string): { fn: (x: number) => number; vertex?: { x: number; y: number } } {
  const s = raw.replace(/\s+/g, "").replace(/^y=/i, "").replace(/²/g, "^2").replace(/³/g, "^3").replace(/−/g, "-");
  let m = s.match(/^(-?\d*\.?\d*)\(x([+-]\d+\.?\d*)\)\^2([+-]\d+\.?\d*)?$/);
  if (m) {
    const a = coef(m[1]); const p = -num(m[2]); const q = m[3] ? num(m[3]) : 0;
    return { fn: (x) => a * (x - p) ** 2 + q, vertex: { x: p, y: q } };
  }
  m = s.match(/^(-?\d*\.?\d*)x\^2(([+-]\d*\.?\d*)x)?([+-]\d+\.?\d*)?$/);
  if (m) {
    const a = coef(m[1]); const b = m[2] ? coef(m[3]) : 0; const c = m[4] ? num(m[4]) : 0;
    const vx = -b / (2 * a); const vy = a * vx ** 2 + b * vx + c;
    return { fn: (x) => a * x ** 2 + b * x + c, vertex: { x: vx, y: vy } };
  }
  m = s.match(/^(-?\d*\.?\d*)x\^3([+-]\d+\.?\d*)?$/);
  if (m) { const a = coef(m[1]); const c = m[2] ? num(m[2]) : 0; return { fn: (x) => a * x ** 3 + c }; }
  m = s.match(/^(-?\d*\.?\d*)\/x$/);
  if (m) { const a = coef(m[1]); return { fn: (x) => (x === 0 ? NaN : a / x) }; }
  if (/sqrt|√/.test(s)) return { fn: (x) => (x < 0 ? NaN : Math.sqrt(x)) };
  if (/\|x\|/.test(raw)) return { fn: (x) => Math.abs(x) };
  if (/sin/.test(s)) return { fn: (x) => Math.sin(x) };
  if (/cos/.test(s)) return { fn: (x) => Math.cos(x) };
  if (/tan/.test(s)) return { fn: (x) => Math.tan(x) };
  m = s.match(/^(-?\d*\.?\d*)x([+-]\d+\.?\d*)?$/);
  if (m) { const a = coef(m[1]); const b = m[2] ? num(m[2]) : 0; return { fn: (x) => a * x + b }; }
  m = s.match(/^(-?\d+\.?\d*)$/);
  if (m) { const c = num(m[1]); return { fn: () => c }; }
  return { fn: (x) => x * x, vertex: { x: 0, y: 0 } };
}

function mathGraphSvg(formula: string): string {
  const { fn, vertex } = parseFormula(formula);
  const samples: Array<{ x: number; y: number }> = [];
  for (let x = X_MIN; x <= X_MAX + 0.001; x += 0.1) {
    const y = fn(x);
    if (Number.isFinite(y)) samples.push({ x, y });
  }
  const yvals = samples.map((s) => s.y).filter((y) => Math.abs(y) <= 50);
  let yMin = Math.min(0, ...yvals); let yMax = Math.max(0, ...yvals);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) { yMin = -10; yMax = 10; }
  const padY = (yMax - yMin) * 0.12 || 1; yMin -= padY; yMax += padY;
  const plotW = GW - 2 * GM, plotH = GH - 2 * GM;
  const sx = (x: number) => GM + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
  const sy = (y: number) => GM + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  let path = ""; let started = false;
  for (const s of samples) {
    if (Math.abs(s.y) > 50) { started = false; continue; }
    const X = sx(s.x), Y = sy(s.y);
    if (Y < GM - 4 || Y > GH - GM + 4) { started = false; continue; }
    path += (started ? " L " : " M ") + `${X.toFixed(1)} ${Y.toFixed(1)}`;
    started = true;
  }
  const ox = sx(0), oy = sy(0);
  const gridV = Array.from({ length: 11 }, (_, i) => { const X = sx(X_MIN + i * 2); return `<line x1="${X.toFixed(1)}" y1="${GM}" x2="${X.toFixed(1)}" y2="${GH - GM}" stroke="#102033" stroke-opacity="0.05"/>`; }).join("");
  const gridH = Array.from({ length: 9 }, (_, i) => { const Y = GM + (i * plotH) / 8; return `<line x1="${GM}" y1="${Y.toFixed(1)}" x2="${GW - GM}" y2="${Y.toFixed(1)}" stroke="#102033" stroke-opacity="0.05"/>`; }).join("");
  const vertexMark = vertex && Math.abs(vertex.x) <= 10
    ? `<circle cx="${sx(vertex.x).toFixed(1)}" cy="${sy(vertex.y).toFixed(1)}" r="5" fill="#f97316" stroke="white" stroke-width="2"/>
       <text x="${(sx(vertex.x) + 10).toFixed(1)}" y="${(sy(vertex.y) - 8).toFixed(1)}" fill="#f97316" font-size="13" font-weight="700" font-family="Pretendard">꼭짓점 (${+vertex.x.toFixed(2)}, ${+vertex.y.toFixed(2)})</text>`
    : "";
  return `
<svg viewBox="0 0 ${GW} ${GH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fff8ef;border-radius:16px;">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#576274"/></marker></defs>
  ${gridV}${gridH}
  <line x1="${GM}" y1="${oy.toFixed(1)}" x2="${GW - GM}" y2="${oy.toFixed(1)}" stroke="#576274" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="${ox.toFixed(1)}" y1="${GH - GM}" x2="${ox.toFixed(1)}" y2="${GM}" stroke="#576274" stroke-width="1.5" marker-end="url(#arrow)"/>
  <text x="${GW - GM + 4}" y="${(oy - 6).toFixed(1)}" fill="#576274" font-size="13" font-family="Pretendard">x</text>
  <text x="${(ox + 8).toFixed(1)}" y="${GM - 2}" fill="#576274" font-size="13" font-family="Pretendard">y</text>
  <path d="${path}" stroke="#0b8f80" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${vertexMark}
  <text x="14" y="22" fill="#102033" font-size="14" font-weight="700" font-family="Pretendard">${escapeXml(formula)}</text>
</svg>`.trim();
}

// ============================================================
// 다이어그램
// ============================================================

function buoyancyDiagram(concept: string): string {
  const body = `
  <rect x="40" y="180" width="400" height="100" fill="#0b8f80" fill-opacity="0.18" rx="8"/>
  <rect x="40" y="180" width="400" height="6" fill="#0b8f80" fill-opacity="0.5"/>
  <text x="390" y="200" fill="#0b8f80" font-size="12" font-weight="700" font-family="Pretendard">수면</text>
  <rect x="200" y="160" width="80" height="80" fill="#f97316" stroke="#102033" stroke-width="2" rx="6"/>
  <text x="240" y="208" text-anchor="middle" fill="white" font-size="14" font-weight="700">물체</text>
  <line x1="240" y1="105" x2="240" y2="155" stroke="#d25b4d" stroke-width="3" marker-end="url(#redArrow)"/>
  <text x="252" y="135" fill="#d25b4d" font-size="13" font-weight="700" font-family="Pretendard">중력 mg</text>
  <line x1="130" y1="245" x2="130" y2="195" stroke="#0b8f80" stroke-width="3" marker-end="url(#tealArrow)"/>
  <text x="60" y="225" fill="#0b8f80" font-size="13" font-weight="700" font-family="Pretendard">부력 ρVg</text>
  <text x="50" y="262" fill="#576274" font-size="11" font-family="Pretendard">밀려난 물의 부피 V</text>`;
  return svgFrame(concept, "물체에 작용하는 두 힘: 부력(↑) = 밀려난 물의 무게", body);
}

function circuitDiagram(concept: string): string {
  const bulb = (cx: number, cy: number) =>
    `<circle cx="${cx}" cy="${cy}" r="13" fill="#fff" stroke="#102033" stroke-width="2"/>
     <line x1="${cx - 9}" y1="${cy - 9}" x2="${cx + 9}" y2="${cy + 9}" stroke="#102033" stroke-width="1.5"/>
     <line x1="${cx - 9}" y1="${cy + 9}" x2="${cx + 9}" y2="${cy - 9}" stroke="#102033" stroke-width="1.5"/>`;
  const battery = (x: number, y: number) =>
    `<line x1="${x}" y1="${y - 11}" x2="${x}" y2="${y + 11}" stroke="#102033" stroke-width="3"/>
     <line x1="${x + 7}" y1="${y - 6}" x2="${x + 7}" y2="${y + 6}" stroke="#102033" stroke-width="2"/>`;
  const body = `
  <text x="105" y="78" text-anchor="middle" fill="#0b8f80" font-size="13" font-weight="700" font-family="Pretendard">직렬</text>
  <rect x="40" y="90" width="130" height="120" fill="none" stroke="#576274" stroke-width="2.5" rx="6"/>
  ${battery(40, 150)}${bulb(95, 90)}${bulb(140, 90)}
  <text x="105" y="232" text-anchor="middle" fill="#576274" font-size="10.5" font-family="Pretendard">한 줄 연결 · 하나 끊기면 모두 꺼짐</text>
  <text x="345" y="78" text-anchor="middle" fill="#0b8f80" font-size="13" font-weight="700" font-family="Pretendard">병렬</text>
  <rect x="290" y="90" width="120" height="120" fill="none" stroke="#576274" stroke-width="2.5" rx="6"/>
  ${battery(290, 150)}
  <line x1="330" y1="90" x2="330" y2="210" stroke="#576274" stroke-width="2.5"/>
  <line x1="370" y1="90" x2="370" y2="210" stroke="#576274" stroke-width="2.5"/>
  ${bulb(330, 150)}${bulb(370, 150)}
  <text x="350" y="232" text-anchor="middle" fill="#576274" font-size="10.5" font-family="Pretendard">가지마다 연결 · 하나 꺼져도 켜짐</text>`;
  return svgFrame(concept, "전구(⊗)와 전지(┤├)의 연결 방식 비교", body);
}

function photosynthesisDiagram(concept: string): string {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const ang = (i * Math.PI) / 4;
    const x1 = 80 + Math.cos(ang) * 28, y1 = 95 + Math.sin(ang) * 28;
    const x2 = 80 + Math.cos(ang) * 36, y2 = 95 + Math.sin(ang) * 36;
    return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#f9b233" stroke-width="3" stroke-linecap="round"/>`;
  }).join("");
  const body = `
  <circle cx="80" cy="95" r="22" fill="#f9b233"/>${rays}
  <text x="80" y="150" text-anchor="middle" fill="#576274" font-size="11" font-family="Pretendard">빛 에너지</text>
  <ellipse cx="240" cy="170" rx="70" ry="42" fill="#0b8f80" fill-opacity="0.85"/>
  <text x="240" y="175" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Pretendard">엽록체</text>
  <rect x="234" y="212" width="12" height="70" fill="#7c5a3a" rx="3"/>
  <line x1="110" y1="110" x2="178" y2="160" stroke="#f9b233" stroke-width="3" marker-end="url(#grayArrow)"/>
  <line x1="60" y1="250" x2="172" y2="195" stroke="#576274" stroke-width="2.5" marker-end="url(#grayArrow)"/>
  <text x="40" y="268" fill="#576274" font-size="12" font-weight="700" font-family="Pretendard">물 H₂O</text>
  <line x1="240" y1="285" x2="240" y2="220" stroke="#576274" stroke-width="2.5" marker-end="url(#grayArrow)"/>
  <text x="250" y="280" fill="#576274" font-size="12" font-weight="700" font-family="Pretendard">이산화탄소 CO₂</text>
  <line x1="308" y1="160" x2="380" y2="120" stroke="#0b8f80" stroke-width="3" marker-end="url(#tealArrow)"/>
  <text x="360" y="112" fill="#0b8f80" font-size="12" font-weight="700" font-family="Pretendard">산소 O₂</text>
  <line x1="308" y1="185" x2="380" y2="210" stroke="#f97316" stroke-width="3" marker-end="url(#redArrow)"/>
  <text x="350" y="230" fill="#f97316" font-size="12" font-weight="700" font-family="Pretendard">포도당</text>`;
  return svgFrame(concept, "빛 + 물 + CO₂ → 포도당 + O₂ (엽록체에서 일어남)", body);
}

/** 부력/전기회로/광합성처럼 전용 도해가 있는 개념이면 SVG, 아니면 null */
function knownDiagramSvg(concept: string): string | null {
  const c = concept.toLowerCase();
  if (/부력|밀도|뜨|가라앉|buoyan|float/.test(c)) return buoyancyDiagram(concept);
  if (/회로|전기|전류|직렬|병렬|전지|전구|circuit/.test(c)) return circuitDiagram(concept);
  if (/광합성|엽록|photosynth/.test(c)) return photosynthesisDiagram(concept);
  return null;
}

/** 임의 개념을 4갈래 개념맵으로 렌더 (LLM이 채운 내용 또는 기본 라벨) */
function conceptMapSvg(title: string, subtitle: string, nodes: string[]): string {
  const pos = [{ x: 110, y: 110 }, { x: 370, y: 110 }, { x: 110, y: 250 }, { x: 370, y: 250 }];
  const lines = pos.map((s) => `<line x1="240" y1="180" x2="${s.x}" y2="${s.y}" stroke="#576274" stroke-opacity="0.4" stroke-width="2"/>`).join("");
  const nodeSvg = pos.map((s, i) => {
    const label = (nodes[i] ?? "").slice(0, 16);
    return `<rect x="${s.x - 68}" y="${s.y - 22}" width="136" height="44" rx="22" fill="#fff" stroke="#0b8f80" stroke-width="1.5"/>
    <text x="${s.x}" y="${s.y + 5}" text-anchor="middle" fill="#0b8f80" font-size="12.5" font-weight="600" font-family="Pretendard">${escapeXml(label)}</text>`;
  }).join("");
  const body = `${lines}${nodeSvg}
  <rect x="158" y="152" width="164" height="56" rx="28" fill="#102033"/>
  <text x="240" y="186" text-anchor="middle" fill="white" font-size="15" font-weight="800" font-family="Pretendard">${escapeXml(title.slice(0, 14))}</text>`;
  return svgFrame(title.slice(0, 22), subtitle.slice(0, 48), body);
}

// ============================================================
// 5사 LLM 호출 (임의 개념 → 시각화용 구조)
// ============================================================

async function llmConcept(concept: string): Promise<{ title: string; summary: string; nodes: string[]; model: string } | null> {
  const provider = getProvider("chat");
  if (!provider) return null;
  try {
    const raw = await provider.chatJson({
      systemPrompt: "너는 중·고등학생 학습을 돕는 교사다. 개념을 개념맵으로 시각화하기 위한 구조를 한국어로 정확하게 만든다.",
      userPrompt:
        `개념: "${concept}"\n` +
        `이 개념을 개념맵으로 시각화하려고 한다. 아래 JSON만 출력(설명/코드블록 금지):\n` +
        `{"title":"개념 이름(12자 이내)","summary":"한 줄 핵심 설명(40자 이내)","nodes":["이 개념을 이해하는 핵심 요소/키워드 4개, 각 14자 이내"]}\n` +
        `nodes는 반드시 4개.`,
      temperature: 0.3,
      timeoutMs: 20000,
    });
    const o = (raw ?? {}) as { title?: unknown; summary?: unknown; nodes?: unknown };
    const nodesRaw = Array.isArray(o.nodes) ? o.nodes.filter((n): n is string => typeof n === "string").map((n) => n.trim()).filter(Boolean) : [];
    if (nodesRaw.length < 4) return null;
    return {
      title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : concept,
      summary: typeof o.summary === "string" ? o.summary.trim() : "",
      nodes: nodesRaw.slice(0, 4),
      model: provider.name,
    };
  } catch {
    return null;
  }
}

async function llmComic(concept: string): Promise<{ panels: NonNullable<VisualResult["panels"]>; model: string } | null> {
  const provider = getProvider("chat");
  if (!provider) return null;
  try {
    const raw = await provider.chatJson({
      systemPrompt: "너는 학생용 4컷 학습 만화 시나리오 작가다. 한국어로, 학생이 스스로 원리를 떠올리게 유도한다.",
      userPrompt:
        `개념: "${concept}"\n아래 JSON만 출력:\n` +
        `{"panels":[{"caption":"1컷","emoji":"이모지 1개","text":"장면 대사/설명(40자 이내)"}]}\npanels는 정확히 4개.`,
      temperature: 0.6,
      timeoutMs: 20000,
    });
    const arr = (raw as { panels?: unknown })?.panels;
    if (!Array.isArray(arr) || arr.length < 4) return null;
    const panels = arr.slice(0, 4).map((p, i) => {
      const o = (p ?? {}) as { caption?: unknown; emoji?: unknown; text?: unknown };
      return {
        caption: typeof o.caption === "string" ? o.caption : `${i + 1}컷`,
        emoji: typeof o.emoji === "string" ? o.emoji : "💡",
        text: typeof o.text === "string" ? o.text : "",
      };
    });
    return { panels, model: provider.name };
  } catch {
    return null;
  }
}

// ============================================================

function comicTemplate(concept: string): VisualResult["panels"] {
  return [
    { caption: "1컷", emoji: "🤔", text: `학생: "${concept}이 뭐야?"` },
    { caption: "2컷", emoji: "💡", text: `AI: "주변에서 이런 현상 봤지? 한번 떠올려봐."` },
    { caption: "3컷", emoji: "🔍", text: `학생이 직접 사례를 떠올리고 핵심 원리를 추측` },
    { caption: "4컷", emoji: "✨", text: `AI: "정확해! 그게 바로 ${concept}의 핵심이야."` },
  ];
}

/** 규칙기반(결정적) 결과 — LLM 없이도 동작하는 폴백 */
export function heuristicVisual(kind: VisualKind, prompt: string): VisualResult {
  if (kind === "graph") {
    return { mode: "demo_ai", modelName: "규칙기반 SVG", kind, prompt, svg: mathGraphSvg(prompt), description: `${prompt} 그래프 (이차함수는 꼭짓점 표시).` };
  }
  if (kind === "comic") {
    return { mode: "demo_ai", modelName: "템플릿", kind, prompt, panels: comicTemplate(prompt), description: `"${prompt}" 학습 만화 4컷.` };
  }
  const known = knownDiagramSvg(prompt);
  if (known) {
    return { mode: "demo_ai", modelName: "규칙기반 SVG", kind, prompt, svg: known, description: `${prompt} 개념 다이어그램.` };
  }
  return {
    mode: "demo_ai",
    modelName: "규칙기반 SVG",
    kind,
    prompt,
    svg: conceptMapSvg(prompt, "개념을 네 갈래로 정리한 개념맵", ["핵심 정의", "공식·원리", "대표 예시", "자주 틀리는 점"]),
    description: `${prompt} 개념맵.`,
  };
}

export async function generateVisual(kind: VisualKind, prompt: string): Promise<VisualResult> {
  // 그래프: 결정적 플로터
  if (kind === "graph") return heuristicVisual(kind, prompt);

  // 다이어그램: 전용 도해가 있으면 그것, 없으면 LLM으로 개념 내용 생성 → 개념맵
  if (kind === "diagram") {
    const known = knownDiagramSvg(prompt);
    if (known) return heuristicVisual(kind, prompt);
    const c = await llmConcept(prompt);
    if (c) {
      return {
        mode: "live_ai",
        modelName: c.model,
        kind,
        prompt,
        svg: conceptMapSvg(c.title, c.summary || `${prompt} 개념맵`, c.nodes),
        description: c.summary || `${prompt}의 핵심을 개념맵으로 정리했습니다.`,
      };
    }
    return heuristicVisual(kind, prompt); // LLM 없음 → 빈 개념맵
  }

  // 만화: LLM 시나리오, 없으면 템플릿
  const c = await llmComic(prompt);
  if (c) {
    return { mode: "live_ai", modelName: c.model, kind, prompt, panels: c.panels, description: `"${prompt}" 학습 만화 4컷.` };
  }
  return heuristicVisual(kind, prompt);
}
