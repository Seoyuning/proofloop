"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { ClassPatternReport } from "@/lib/class-pattern";

const PERIOD_OPTIONS = [
  "2026년 1학기 (3월~6월)",
  "2025년 2학기 (9월~12월)",
];

function severityClass(severity: "high" | "mid" | "low") {
  return severity === "high"
    ? "border-red/40 bg-red/8 text-red"
    : severity === "mid"
      ? "border-orange/40 bg-orange/8 text-orange"
      : "border-amber/40 bg-amber/10 text-amber";
}

export default function ClassPatternPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0]);
  const [report, setReport] = useState<ClassPatternReport | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "teacher") router.replace("/studio/chat");
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "teacher") return null;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/class-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      setReport(await res.json());
    } finally {
      setGenerating(false);
    }
  }

  const maxBucket = report ? Math.max(...report.understandingDistribution.map((b) => b.count), 1) : 1;

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">반 패턴 분석</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">KT Mi:dm 128K</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">반 전체 학습 패턴</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          반 전체 학생의 한 학기 데이터를 한 번에 분석합니다. 학습 격차, 공통 오개념, 그룹별 학습 권고를 자동 생성합니다.
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-2 block text-xs font-semibold text-muted">기간</span>
            <select
              className="w-full rounded-[16px] border border-line bg-white px-4 py-3 text-sm outline-none focus:border-teal"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {PERIOD_OPTIONS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </label>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex w-full items-center justify-center rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {generating ? "분석 중..." : "반 패턴 분석"}
            </button>
          </div>
        </div>
      </section>

      {report && (
        <>
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">반 종합</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-navy">{report.classLabel}</h3>
                <p className="text-sm text-muted">{report.period} · 학생 {report.studentCount}명</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${report.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"}`}>
                {report.mode === "live_ai" ? `LIVE · ${report.modelName}` : "DEMO · 휴리스틱 폴백"}
              </span>
            </div>
            <p className="mt-5 leading-7 text-foreground">{report.summaryNarrative}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-line bg-surface-strong p-4">
                <p className="text-xs font-semibold text-muted">반 평균 이해도</p>
                <p className="mt-1 text-3xl font-bold tracking-[-0.04em] text-navy">{report.classAverageUnderstanding}<span className="ml-1 text-sm text-muted">/ 5</span></p>
              </div>
              <div className="rounded-[20px] border border-line bg-surface-strong p-4">
                <p className="mb-2 text-xs font-semibold text-muted">이해도 분포</p>
                <div className="flex items-end gap-2 h-20">
                  {report.understandingDistribution.map((b) => (
                    <div key={b.range} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full bg-teal rounded-t-md" style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: b.count > 0 ? 8 : 0 }} title={`${b.count}명`} />
                      <span className="text-[10px] text-muted whitespace-nowrap">{b.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="공통 약점" title="여러 학생이 막힌 단원" copy="반 절반 이상이 어려움을 겪는 영역부터 다음 수업에 반영하세요." />
            <div className="mt-5 grid gap-3">
              {report.commonWeakUnits.map((u) => (
                <div key={u.unit} className={`rounded-[20px] border p-4 ${severityClass(u.severity)}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-semibold text-navy">{u.unit}</p>
                    <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                      {u.affectedStudents}명 영향 · 평균 {u.averageUnderstanding}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {report.classWideMisconceptions.length > 0 && (
            <section className="app-panel rounded-[28px] p-5 sm:p-6">
              <SectionHeader kicker="반 전체 오개념" title="공통적으로 잘못 이해한 패턴" copy="시험 변별 문항 후보로 사용할 수 있습니다." />
              <div className="mt-5 grid gap-3">
                {report.classWideMisconceptions.map((m) => (
                  <div key={m.name} className="rounded-[20px] border border-line bg-surface-strong p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-navy">{m.name}</p>
                      <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold text-white">{m.affectedCount}명</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{m.example}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="그룹 편성" title="학습 수준별 그룹 권고" copy="일제식 보강 대신 그룹별 차별화된 접근을 추천합니다." />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {report.groupingSuggestions.map((g) => (
                <div key={g.groupName} className="rounded-[20px] border border-line bg-surface-strong p-4">
                  <p className="text-sm font-bold text-navy">{g.groupName}</p>
                  <p className="mt-1 text-xs text-muted">{g.studentNames.join(", ")}</p>
                  <p className="mt-3 text-sm leading-6 text-foreground">{g.focus}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="권고" title="다음 수업·시험 적용" copy="" />
            <ul className="mt-5 grid gap-3">
              {report.teachingRecommendations.map((r, i) => (
                <li key={i} className="rounded-[20px] border border-teal/16 bg-teal/7 p-4 text-sm leading-7 text-foreground">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
