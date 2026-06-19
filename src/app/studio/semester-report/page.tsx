"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { SemesterReport } from "@/lib/semester-report";

interface FixtureStudent {
  id: string;
  name: string;
  classLabel: string;
}

const PERIOD_OPTIONS = [
  "2026년 1학기 (3월~6월)",
  "2025년 2학기 (9월~12월)",
  "2025년 1학기 (3월~6월)",
];

function severityColor(severity: "high" | "mid" | "low"): string {
  switch (severity) {
    case "high":
      return "border-red/40 bg-red/8 text-red";
    case "mid":
      return "border-orange/40 bg-orange/8 text-orange";
    default:
      return "border-amber/40 bg-amber/10 text-amber";
  }
}

function severityLabel(severity: "high" | "mid" | "low"): string {
  return severity === "high" ? "방학 1순위" : severity === "mid" ? "방학 보강 권장" : "가벼운 복습";
}

function TrendBars({ trend }: { trend: SemesterReport["understandingTrend"] }) {
  if (trend.length === 0) {
    return <p className="text-sm text-muted">추세를 그릴 데이터가 부족합니다.</p>;
  }
  const max = 5;
  return (
    <div className="flex items-end gap-1.5 sm:gap-2">
      {trend.map((point) => {
        const heightPct = Math.round((point.level / max) * 100);
        const colorClass = point.level >= 4 ? "bg-teal" : point.level >= 3 ? "bg-orange" : "bg-red/80";
        return (
          <div key={point.week} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-24 w-full items-end">
              <div
                className={`w-full rounded-t-md transition-all ${colorClass}`}
                style={{ height: `${heightPct}%` }}
                title={`${point.week}: ${point.level}`}
              />
            </div>
            <span className="text-[10px] text-muted">{point.week}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SemesterReportPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [students, setStudents] = useState<FixtureStudent[]>([]);
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0]);
  const [report, setReport] = useState<SemesterReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/semester-report")
      .then((r) => r.json())
      .then((d) => {
        setStudents(d.students ?? []);
        if (d.students?.[0]) setStudentId(d.students[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/studio/login");
      return;
    }
    if (user.role !== "teacher") router.replace("/studio/chat");
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "teacher") return null;

  async function handleGenerate() {
    if (!studentId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/semester-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, period }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setReport(data as SemesterReport);
      }
    } catch (e) {
      setError("리포트 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">학기 종합 리포트</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">KT Mi:dm 128K</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
          학기 학습 부채 리포트
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          학생 한 명의 한 학기 전체 채팅·진단 데이터를 128K 장문맥에 통째로 넣고 분석합니다.
          학기 내내 해결되지 않은 약점, 반복된 오개념, 방학 학습 권고를 자동 생성합니다.
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <SectionHeader kicker="대상 선택" title="학생과 기간" copy="리포트를 생성할 학생과 분석 기간을 선택하세요." />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">학생</span>
            <select
              className="w-full rounded-[16px] border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.classLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">기간</span>
            <select
              className="w-full rounded-[16px] border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !studentId}
              className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "리포트 생성 중..." : "리포트 생성"}
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-[16px] border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">{error}</p>
        )}
      </section>

      {report && (
        <>
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">학기 요약</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-navy">
                  {report.studentName} — {report.classLabel}
                </h3>
                <p className="text-sm text-muted">{report.period}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  report.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"
                }`}
              >
                {report.mode === "live_ai" ? `LIVE · ${report.modelName}` : "DEMO · 휴리스틱 폴백"}
              </span>
            </div>
            <p className="mt-5 leading-7 text-foreground">{report.summaryNarrative}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-line bg-surface-strong p-4">
                <p className="text-xs font-semibold text-muted">총 질문</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-navy">{report.totalQuestions}</p>
              </div>
              <div className="rounded-[20px] border border-line bg-surface-strong p-4">
                <p className="text-xs font-semibold text-muted">평균 이해도</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-navy">{report.averageUnderstanding} <span className="text-sm text-muted">/ 5</span></p>
              </div>
              <div className="rounded-[20px] border border-line bg-surface-strong p-4">
                <p className="text-xs font-semibold text-muted">학습 부채 단원</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-navy">{report.learningDebt.length}</p>
              </div>
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="추세" title="주차별 이해도 변화" copy="학기 동안 평균 이해도가 어떻게 변했는지 한눈에 확인합니다." />
            <div className="mt-5">
              <TrendBars trend={report.understandingTrend} />
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              kicker="학습 부채"
              title="학기 동안 해결되지 않은 약점"
              copy="질문이 반복되었지만 이해도가 회복되지 않은 단원입니다."
            />
            {report.learningDebt.length === 0 ? (
              <p className="mt-5 text-sm text-muted">이 학기에서는 명확한 학습 부채가 발견되지 않았습니다.</p>
            ) : (
              <div className="mt-5 grid gap-3">
                {report.learningDebt.map((d) => (
                  <div key={d.unit} className={`rounded-[20px] border p-4 ${severityColor(d.severity)}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold text-navy">{d.unit}</p>
                      <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                        {d.weeksUnsolved}주 누적 · {severityLabel(d.severity)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{d.evidence}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {report.recurringMisconceptions.length > 0 && (
            <section className="app-panel rounded-[28px] p-5 sm:p-6">
              <SectionHeader kicker="반복 오개념" title="학기 내내 반복된 오개념" copy="여러 번 나타난 패턴 — 방학 동안 우선 짚어야 합니다." />
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {report.recurringMisconceptions.map((m) => (
                  <div key={m.name} className="flex items-center justify-between rounded-[16px] border border-line bg-surface-strong p-4">
                    <span className="font-medium text-navy">{m.name}</span>
                    <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold text-white">{m.count}회</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="권고" title="방학 학습 권고" copy="다음 학기 출발이 안정적이려면 무엇을 짚어야 하는지." />
            <ul className="mt-5 grid gap-3">
              {report.recommendedFocus.map((f, i) => (
                <li key={i} className="rounded-[20px] border border-teal/16 bg-teal/7 p-4 text-sm leading-7 text-foreground">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="학부모 면담" title="학부모용 한 문단" copy="전문용어 없이 따뜻한 어조로 정리한 면담 자료입니다." />
            <p className="mt-5 rounded-[20px] border border-line bg-surface-strong p-5 leading-8 text-foreground">{report.parentNote}</p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(report.parentNote)}
                className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-teal"
              >
                클립보드에 복사
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
