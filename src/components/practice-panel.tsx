"use client";

import { useEffect, useState } from "react";
import type { GradeResult, PracticeQuestion } from "@/lib/practice";

type Phase = "generating" | "solving" | "grading" | "done" | "error" | "empty";

export function PracticePanel({
  classId,
  concept,
  sessionId,
  onClose,
}: {
  classId: string;
  concept: string;
  sessionId: string | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("generating");
  const [setId, setSetId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<GradeResult[]>([]);
  const [error, setError] = useState<string>("");
  const [usedConcept, setUsedConcept] = useState(concept);

  async function generate() {
    setPhase("generating");
    setError("");
    setResults([]);
    setAnswers({});
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, concept, sessionId, count: 3 }),
      });
      const data = await res.json();
      if (data.empty) { setError(data.error || "이 학년 문제 데이터가 아직 없어요."); setPhase("empty"); return; }
      if (!res.ok || !data.setId) { setError(data.error || "문제 생성에 실패했어요."); setPhase("error"); return; }
      setSetId(data.setId);
      setQuestions(data.questions ?? []);
      setUsedConcept(data.concept || concept);
      setPhase("solving");
    } catch {
      setError("문제 생성에 실패했어요.");
      setPhase("error");
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!setId) return;
    setPhase("grading");
    try {
      const payload = questions.map((q) => ({ index: q.index, answer: answers[q.index] ?? "" }));
      const res = await fetch("/api/practice/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId, answers: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.results) { setError(data.error || "채점에 실패했어요."); setPhase("error"); return; }
      setResults(data.results);
      setPhase("done");
    } catch {
      setError("채점에 실패했어요.");
      setPhase("error");
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.index] ?? "").trim().length > 0);
  const correctCount = results.filter((r) => r.isCorrect).length;

  return (
    <div className="rounded-[22px] border border-teal/30 bg-teal/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy">📝 맞춤 연습문제 · {usedConcept}</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full px-2 py-0.5 text-sm text-muted hover:text-navy">✕</button>
      </div>

      {phase === "generating" && (
        <p className="mt-3 text-sm text-teal animate-pulse">너에게 맞는 문제를 만들고 있어…</p>
      )}

      {(phase === "empty" || phase === "error") && (
        <div className="mt-3">
          <p className="text-sm text-muted">{error}</p>
          {phase === "error" && (
            <button type="button" onClick={generate} className="mt-2 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white">다시 시도</button>
          )}
        </div>
      )}

      {(phase === "solving" || phase === "grading") && (
        <div className="mt-3 space-y-4">
          {questions.map((q) => (
            <div key={q.index} className="rounded-[16px] border border-line bg-white p-3">
              <p className="text-sm font-medium text-navy">{q.index + 1}. {q.question}</p>
              {q.choices && q.choices.length > 0 ? (
                <div className="mt-2 grid gap-1.5">
                  {q.choices.map((c, ci) => {
                    const selected = answers[q.index] === c;
                    return (
                      <button
                        key={ci}
                        type="button"
                        disabled={phase === "grading"}
                        onClick={() => setAnswers((a) => ({ ...a, [q.index]: c }))}
                        className={`rounded-[12px] border px-3 py-2 text-left text-sm transition-colors ${
                          selected ? "border-teal bg-teal/10 font-semibold text-navy" : "border-line bg-white text-muted hover:border-teal/40"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  value={answers[q.index] ?? ""}
                  disabled={phase === "grading"}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.index]: e.target.value }))}
                  placeholder="답을 입력하세요"
                  className="mt-2 w-full rounded-[12px] border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal"
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || phase === "grading"}
            className="w-full rounded-full bg-orange py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "grading" ? "채점 중…" : "채점하기"}
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-3 space-y-4">
          <p className="text-sm font-semibold text-navy">{questions.length}문제 중 {correctCount}개 정답 🎉</p>
          {results.map((r) => {
            const q = questions.find((x) => x.index === r.index);
            return (
              <div key={r.index} className={`rounded-[16px] border p-3 ${r.isCorrect ? "border-teal/30 bg-teal/5" : "border-red-200 bg-red-50/60"}`}>
                <p className="text-sm font-medium text-navy">{r.index + 1}. {q?.question}</p>
                <p className={`mt-1.5 text-sm font-semibold ${r.isCorrect ? "text-teal" : "text-red-500"}`}>
                  {r.isCorrect ? "✅ 정답" : "❌ 다시 보기"} · 내 답: {answers[r.index] || "(미응답)"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">{r.feedback}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-navy/70">정답 · 풀이 보기</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted">정답: {r.answer}{r.solution ? `\n\n${r.solution}` : ""}</p>
                </details>
              </div>
            );
          })}
          <div className="flex gap-2">
            <button type="button" onClick={generate} className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5">새 문제 풀기</button>
            <button type="button" onClick={onClose} className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-muted hover:border-teal">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
