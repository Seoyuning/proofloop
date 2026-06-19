"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { VisualResult, VisualKind } from "@/lib/visual-generator";

const PRESETS: Record<VisualKind, Array<{ label: string; prompt: string }>> = {
  diagram: [
    { label: "부력의 원리", prompt: "부력의 원리" },
    { label: "전기 회로", prompt: "전기 회로 직렬·병렬 비교" },
    { label: "광합성 과정", prompt: "광합성 과정" },
  ],
  graph: [
    { label: "y = (x-2)² + 3", prompt: "y = (x-2)² + 3" },
    { label: "y = -2(x+1)² - 4", prompt: "y = -2(x+1)² - 4" },
    { label: "y = x² - 4x + 5", prompt: "y = x² - 4x + 5" },
  ],
  comic: [
    { label: "관성의 법칙", prompt: "관성의 법칙" },
    { label: "확률의 독립", prompt: "확률의 독립" },
    { label: "이차함수 활용", prompt: "이차함수 활용" },
  ],
};

export default function VisualPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [kind, setKind] = useState<VisualKind>("diagram");
  const [prompt, setPrompt] = useState(PRESETS.diagram[0].prompt);
  const [result, setResult] = useState<VisualResult | null>(null);
  const [busy, setBusy] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/studio/login");
  }, [user, isLoading, router]);

  // 첫 진입 시 자동으로 하나 생성해서 결과 영역이 비어있지 않게
  useEffect(() => {
    if (isLoading || !user || didInit.current) return;
    didInit.current = true;
    generate(kind, prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  if (isLoading || !user) return null;

  async function generate(k: VisualKind = kind, p: string = prompt) {
    setBusy(true);
    try {
      const res = await fetch("/api/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: k, prompt: p }),
      });
      setResult(await res.json());
    } finally { setBusy(false); }
  }

  function pickKind(k: VisualKind) {
    setKind(k);
    setPrompt(PRESETS[k][0].prompt);
    generate(k, PRESETS[k][0].prompt); // 탭 전환 시 즉시 생성
  }

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">시각자료</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">NC AI VARCO</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">개념 시각화</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          부력·밀도·화학반응 같은 시각적 개념을 다이어그램·그래프·만화로 즉시 생성합니다.
          현재는 규칙기반 SVG 엔진으로 생성하며, NC AI VARCO 멀티모달 연동을 준비 중입니다.
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {(["diagram", "graph", "comic"] as VisualKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pickKind(k)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                kind === k ? "bg-navy text-white" : "border border-line bg-white text-muted"
              }`}
            >
              {k === "diagram" ? "🔬 다이어그램" : k === "graph" ? "📈 수학 그래프" : "🎨 학습 만화"}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {PRESETS[kind].map((p) => (
            <button
              key={p.prompt}
              type="button"
              onClick={() => { setPrompt(p.prompt); generate(kind, p.prompt); }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                prompt === p.prompt ? "bg-teal/10 text-teal" : "border border-line bg-surface-strong text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
            placeholder="개념 또는 수식 입력 후 Enter"
            className="flex-1 min-w-[240px] rounded-[16px] border border-line bg-white px-4 py-3 text-sm outline-none focus:border-teal"
          />
          <button
            type="button"
            onClick={() => generate()}
            disabled={busy}
            className="rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "생성 중..." : "시각자료 생성"}
          </button>
        </div>
      </section>

      {result && (
        <section className="app-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <SectionHeader kicker={result.kind === "graph" ? "수학 그래프" : result.kind === "comic" ? "학습 만화" : "개념 다이어그램"} title={result.prompt} copy={result.description} />
            <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${result.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-navy/8 text-navy/70"}`}>
              {result.mode === "live_ai" ? `LIVE · ${result.modelName}` : "자동 생성 · 규칙기반 SVG"}
            </span>
          </div>

          <div className="mt-5">
            {result.svg && (
              <div className="rounded-[20px] border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: result.svg }} />
            )}
            {result.panels && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {result.panels.map((panel, i) => (
                  <div key={i} className="rounded-[20px] border border-line bg-surface-strong p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-orange">{panel.caption}</p>
                    <p className="mt-3 text-5xl">{panel.emoji}</p>
                    <p className="mt-3 text-sm leading-6 text-foreground">{panel.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.kind === "diagram" && (
            <p className="mt-4 rounded-[16px] border border-orange/30 bg-orange/5 p-4 text-xs text-muted">
              💡 지금은 규칙기반 SVG 엔진으로 즉시 생성합니다. NC VARCO 연동 시 멀티모달 일러스트로 전환됩니다.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
