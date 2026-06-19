"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { SolutionGrading } from "@/lib/reasoning-grader";

const SAMPLE_QUESTION = "이차함수 y = (x-2)² + 3 의 꼭짓점 좌표를 구하세요.";
const SAMPLE_SOLUTION =
  "y = (x-2)² + 3 이므로 꼭짓점은 (-2, 3)입니다. 왜냐하면 (x-2)² 에서 x가 -2일 때 0이 되기 때문입니다.";

function statusIcon(status: "ok" | "warn" | "error") {
  return status === "ok" ? "✓" : status === "warn" ? "△" : "✗";
}

function statusColor(status: "ok" | "warn" | "error") {
  return status === "ok"
    ? "border-teal/40 bg-teal/8 text-teal"
    : status === "warn"
      ? "border-amber/40 bg-amber/10 text-amber"
      : "border-red/40 bg-red/8 text-red";
}

export default function ReasoningPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [solution, setSolution] = useState(SAMPLE_SOLUTION);
  const [grading, setGrading] = useState<SolutionGrading | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/studio/login");
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  async function grade() {
    setBusy(true);
    try {
      const res = await fetch("/api/reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, studentSolution: solution }),
      });
      setGrading(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">풀이 채점</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">LG K-EXAONE 추론 모드</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">서술형 풀이 단계별 채점</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          학생의 수학·과학 풀이 과정을 입력하면, LG K-EXAONE의 추론 모드가 어느 단계에서 논리가 어긋났는지 핀포인트로 잡아냅니다.
          오답 해설과 개념 연결까지 자동으로 생성합니다.
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <SectionHeader kicker="입력" title="문제 + 학생 풀이" copy="문제와 학생이 작성한 풀이를 그대로 붙여넣으세요." />
        <div className="mt-5 grid gap-4">
          <label>
            <span className="mb-2 block text-xs font-semibold text-muted">문제</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full rounded-[16px] border border-line bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-teal"
            />
          </label>
          <label>
            <span className="mb-2 block text-xs font-semibold text-muted">학생 풀이</span>
            <textarea
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              rows={5}
              className="w-full rounded-[16px] border border-line bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-teal"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={grade}
              disabled={busy || !question.trim() || !solution.trim()}
              className="rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? "채점 중..." : "단계별 채점"}
            </button>
          </div>
        </div>
      </section>

      {grading && (
        <>
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <SectionHeader kicker="결과" title={`최종 판정: ${grading.finalVerdict}`} copy={grading.errorPinpoint} />
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${grading.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"}`}>
                {grading.mode === "live_ai" ? `LIVE · ${grading.modelName}` : "DEMO · 휴리스틱"}
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {grading.steps.map((s) => (
                <div key={s.step} className={`rounded-[20px] border p-4 ${statusColor(s.status)}`}>
                  <div className="flex items-baseline gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 font-bold">
                      {statusIcon(s.status)}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-[0.1em]">Step {s.step}</p>
                      <p className="mt-1 font-medium text-navy">{s.studentWrote}</p>
                      <p className="mt-2 text-sm leading-6 text-muted">{s.comment}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="후속 질문" title="이어서 생각해 볼 질문" copy="같은 개념을 다른 각도로 확인합니다." />
            <p className="mt-5 rounded-[20px] border border-teal/16 bg-teal/7 p-5 leading-7 text-foreground">
              {grading.followUpQuestion}
            </p>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="개념 연결" title="이 문제와 연결되는 다른 개념" copy="놓친 연결고리를 보여줍니다." />
            <div className="mt-5 grid gap-3">
              {grading.conceptLinks.map((link, i) => (
                <div key={i} className="rounded-[20px] border border-line bg-surface-strong p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                    <span className="rounded-full bg-teal/12 px-3 py-1 text-xs text-teal">{link.from}</span>
                    <span className="text-muted">→</span>
                    <span className="rounded-full bg-orange/12 px-3 py-1 text-xs text-orange">{link.to}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{link.bridge}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
