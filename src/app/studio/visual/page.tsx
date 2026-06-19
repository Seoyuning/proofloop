"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { VisualResult, VisualKind } from "@/lib/visual-generator";

// 그래프 수식 입력용 기호 (모바일에서 치기 어려운 것들)
const MATH_SYMBOLS = ["²", "³", "^", "√", "×", "÷", "(", ")", "π", "≤", "≥"];

export default function VisualPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [kind, setKind] = useState<VisualKind>("diagram");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<VisualResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/studio/login");
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  function pickKind(k: VisualKind) {
    setKind(k);
    setPrompt("");
    setResult(null);
  }

  function insertSymbol(sym: string) {
    const el = inputRef.current;
    if (!el) { setPrompt(prompt + sym); return; }
    const start = el.selectionStart ?? prompt.length;
    const end = el.selectionEnd ?? prompt.length;
    setPrompt(prompt.slice(0, start) + sym + prompt.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + sym.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const placeholder =
    kind === "graph"
      ? "수식을 입력하세요 (예: y = x² - 4x + 5)"
      : kind === "comic"
        ? "개념을 입력하세요"
        : "궁금한 개념을 입력하세요";

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">시각자료</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">NC AI VARCO</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">개념 시각화</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          궁금한 개념이나 수식을 검색하면 다이어그램·그래프·만화로 즉시 생성합니다.
          현재는 규칙기반 SVG 엔진과 5사 LLM으로 생성하며, NC AI VARCO 멀티모달 연동을 준비 중입니다.
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

        {kind === "graph" && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {MATH_SYMBOLS.map((s) => (
              <button
                key={s}
                type="button"
                tabIndex={-1}
                onClick={() => insertSymbol(s)}
                aria-label={`${s} 입력`}
                className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-navy transition-colors hover:border-teal hover:bg-teal/8"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className={`${kind === "graph" ? "mt-2" : "mt-4"} flex flex-wrap gap-3`}>
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
            placeholder={placeholder}
            className="flex-1 min-w-[240px] rounded-[16px] border border-line bg-white px-4 py-3 text-sm outline-none focus:border-teal"
          />
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "생성 중..." : "시각자료 생성"}
          </button>
        </div>
      </section>

      {result ? (
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
        </section>
      ) : (
        <section className="app-panel rounded-[28px] p-10 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-3 text-sm font-semibold text-navy">궁금한 개념이나 수식을 입력해 보세요</p>
          <p className="mt-1 text-xs text-muted">입력하면 다이어그램·그래프·만화로 시각화해 드려요.</p>
        </section>
      )}
    </div>
  );
}
