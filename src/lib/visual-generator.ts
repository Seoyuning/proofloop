/**
 * NC VARCO 시각자료 생성 어댑터.
 * VARCO는 LLM이 아닌 별도 멀티모달 에셋 생성 API.
 * Endpoint: https://api.varco.ai (실제 호출 스펙은 본선 시작 시점에 확정됨)
 */

export type VisualKind = "diagram" | "graph" | "comic";

export interface VisualResult {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  kind: VisualKind;
  prompt: string;
  // For diagram/graph: SVG markup. For comic: panels
  svg?: string;
  panels?: Array<{ caption: string; emoji: string; text: string }>;
  description: string;
}

function mathGraphSvg(formula: string): string {
  // Plot y = a(x-p)² + q for example
  // Simple parser for y = a(x-p)² + q or y = ax² + bx + c
  let a = 1, p = 0, q = 0;

  const stdMatch = formula.match(/y\s*=\s*(-?\d*)\s*\(\s*x\s*([+-]\s*\d+)\s*\)\s*[\^²2]+\s*([+-]\s*\d+)?/);
  if (stdMatch) {
    a = stdMatch[1] === "" || stdMatch[1] === "-" ? (stdMatch[1] === "-" ? -1 : 1) : parseInt(stdMatch[1], 10);
    p = -parseInt(stdMatch[2].replace(/\s/g, ""), 10);
    q = stdMatch[3] ? parseInt(stdMatch[3].replace(/\s/g, ""), 10) : 0;
  }

  const W = 480, H = 320, cx = W / 2, cy = H / 2 - 20, scale = 22;

  let path = "";
  for (let px = -10; px <= 10; px += 0.1) {
    const py = a * Math.pow(px - p, 2) + q;
    const sx = cx + px * scale;
    const sy = cy - py * scale;
    if (sy < 0 || sy > H) continue;
    path += path.length === 0 ? `M ${sx.toFixed(1)} ${sy.toFixed(1)}` : ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
  }

  const vertexX = cx + p * scale;
  const vertexY = cy - q * scale;

  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fff8ef;border-radius:16px;">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#576274"/>
    </marker>
  </defs>
  <!-- grid -->
  ${Array.from({ length: 21 }, (_, i) => {
    const x = i * (W / 20);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#102033" stroke-opacity="0.06"/>`;
  }).join("")}
  ${Array.from({ length: 15 }, (_, i) => {
    const y = i * (H / 14);
    return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#102033" stroke-opacity="0.06"/>`;
  }).join("")}
  <!-- axes -->
  <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="#576274" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="${cx}" y1="${H}" x2="${cx}" y2="0" stroke="#576274" stroke-width="1.5" marker-end="url(#arrow)"/>
  <text x="${W - 14}" y="${cy - 6}" fill="#576274" font-size="13" font-family="Pretendard">x</text>
  <text x="${cx + 8}" y="14" fill="#576274" font-size="13" font-family="Pretendard">y</text>
  <text x="${cx - 12}" y="${cy + 14}" fill="#576274" font-size="11">O</text>
  <!-- curve -->
  <path d="${path}" stroke="#0b8f80" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- vertex -->
  <circle cx="${vertexX}" cy="${vertexY}" r="5" fill="#f97316" stroke="white" stroke-width="2"/>
  <text x="${vertexX + 10}" y="${vertexY - 8}" fill="#f97316" font-size="13" font-weight="700" font-family="Pretendard">꼭짓점 (${p}, ${q})</text>
  <!-- formula -->
  <text x="14" y="24" fill="#102033" font-size="14" font-weight="700" font-family="Pretendard">${formula}</text>
</svg>`.trim();
}

function diagramSvg(concept: string): string {
  // 부력(buoyancy) 다이어그램 예시 — SVG로 직접 그림
  const W = 480, H = 320;
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:linear-gradient(180deg, #fff8ef 0%, #efe4d2 100%);border-radius:16px;">
  <!-- water -->
  <rect x="40" y="180" width="${W - 80}" height="100" fill="#0b8f80" fill-opacity="0.18" rx="8"/>
  <rect x="40" y="180" width="${W - 80}" height="6" fill="#0b8f80" fill-opacity="0.5"/>
  <text x="${W - 90}" y="200" fill="#0b8f80" font-size="12" font-weight="700" font-family="Pretendard">수면</text>
  <!-- object -->
  <rect x="${W / 2 - 40}" y="160" width="80" height="80" fill="#f97316" stroke="#102033" stroke-width="2" rx="6"/>
  <text x="${W / 2}" y="208" text-anchor="middle" fill="white" font-size="14" font-weight="700">물체</text>
  <!-- gravity arrow (down) -->
  <line x1="${W / 2}" y1="105" x2="${W / 2}" y2="155" stroke="#d25b4d" stroke-width="3" marker-end="url(#redArrow)"/>
  <text x="${W / 2 + 12}" y="135" fill="#d25b4d" font-size="13" font-weight="700" font-family="Pretendard">중력 mg</text>
  <!-- buoyancy arrow (up) -->
  <line x1="${W / 2 - 110}" y1="245" x2="${W / 2 - 110}" y2="195" stroke="#0b8f80" stroke-width="3" marker-end="url(#tealArrow)"/>
  <text x="${W / 2 - 195}" y="225" fill="#0b8f80" font-size="13" font-weight="700" font-family="Pretendard">부력 ρVg</text>
  <!-- displaced volume label -->
  <text x="50" y="260" fill="#576274" font-size="11" font-family="Pretendard">밀려난 물의 부피 V</text>
  <!-- title -->
  <text x="14" y="24" fill="#102033" font-size="16" font-weight="800" font-family="Pretendard">${concept}</text>
  <text x="14" y="46" fill="#576274" font-size="12" font-family="Pretendard">물체에 작용하는 두 힘: 부력(↑) ＝ 무게의 물 부피분 무게</text>
  <defs>
    <marker id="redArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#d25b4d"/>
    </marker>
    <marker id="tealArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0b8f80"/>
    </marker>
  </defs>
</svg>`.trim();
}

function comicPanels(concept: string): VisualResult["panels"] {
  return [
    { caption: "1컷", emoji: "🤔", text: `학생: "${concept}이 뭐야?"` },
    { caption: "2컷", emoji: "💡", text: `AI: "주변에서 이런 현상 봤지? 한번 떠올려봐."` },
    { caption: "3컷", emoji: "🔍", text: `학생이 직접 사례를 떠올리고 핵심 원리를 추측` },
    { caption: "4컷", emoji: "✨", text: `AI: "정확해! 그게 바로 ${concept}의 핵심이야."` },
  ];
}

export function heuristicVisual(kind: VisualKind, prompt: string): VisualResult {
  if (kind === "graph") {
    return {
      mode: "demo_ai",
      modelName: "heuristic-svg",
      kind,
      prompt,
      svg: mathGraphSvg(prompt),
      description: `${prompt} 그래프를 자동 생성했습니다. 꼭짓점 좌표가 표시되어 있습니다.`,
    };
  }
  if (kind === "comic") {
    return {
      mode: "demo_ai",
      modelName: "heuristic-comic",
      kind,
      prompt,
      panels: comicPanels(prompt),
      description: `"${prompt}" 학습 만화 4컷. 학생이 직접 사례를 떠올리도록 유도하는 흐름.`,
    };
  }
  return {
    mode: "demo_ai",
    modelName: "heuristic-svg",
    kind,
    prompt,
    svg: diagramSvg(prompt),
    description: `${prompt} 개념 다이어그램. 핵심 힘과 수식을 함께 표시했습니다.`,
  };
}

export async function generateVisual(kind: VisualKind, prompt: string): Promise<VisualResult> {
  const fallback = heuristicVisual(kind, prompt);
  const apiKey = process.env.VARCO_API_KEY?.trim();
  if (!apiKey) return fallback;

  // VARCO 실제 API 호출은 본선 시작 시 정확한 endpoint·payload 스펙 확정 후 완성.
  // 현재는 키가 있어도 로컬 SVG 폴백으로 동작 (시연용).
  // 실 호출 예시:
  //   const res = await fetch("https://api.varco.ai/v1/art/generate", {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  //     body: JSON.stringify({ prompt, style: kind === "comic" ? "comic-strip" : "educational-diagram" }),
  //   });
  //   const data = await res.json();
  //   return { mode: "live_ai", modelName: "varco-art", ...data };

  return { ...fallback, modelName: "varco-pending-spec" };
}
