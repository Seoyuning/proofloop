"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { ExamDraft, LearningPriorities } from "@/lib/learning-planner";

const STUDENT_OPTIONS = ["민준", "서연", "도윤", "지우"];

export default function CurriculumPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [studentName, setStudentName] = useState(STUDENT_OPTIONS[0]);
  const [priorities, setPriorities] = useState<LearningPriorities | null>(null);
  const [exam, setExam] = useState<ExamDraft | null>(null);
  const [genPri, setGenPri] = useState(false);
  const [genExam, setGenExam] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "teacher") router.replace("/studio/chat");
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "teacher") return null;

  async function loadPriorities() {
    setGenPri(true);
    try {
      const res = await fetch("/api/learning-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "priorities", studentName }),
      });
      setPriorities(await res.json());
    } finally { setGenPri(false); }
  }

  async function loadExam() {
    setGenExam(true);
    try {
      const res = await fetch("/api/learning-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "exam" }),
      });
      setExam(await res.json());
    } finally { setGenExam(false); }
  }

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">학습 계획</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">SKT A.X K1</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">우선순위·시험·커리큘럼</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          SKT A.X K1의 작업 계획 능력으로 학습 우선순위와 4주 방학 커리큘럼, 변별 시험 초안을 자동 생성합니다.
        </p>
      </header>

      {/* 학습 우선순위 + 커리큘럼 */}
      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            kicker="우선순위 + 4주 커리큘럼"
            title={`${studentName} 학생 맞춤 학습 계획`}
            copy="약점 데이터를 기반으로 가장 시급한 단원부터 4주에 나누어 배치합니다."
          />
          <div className="flex gap-2">
            <select
              className="rounded-[16px] border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
            >
              {STUDENT_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <button
              type="button"
              onClick={loadPriorities}
              disabled={genPri}
              className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {genPri ? "생성 중..." : "계획 생성"}
            </button>
          </div>
        </div>

        {priorities && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{priorities.context}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorities.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"}`}>
                {priorities.mode === "live_ai" ? `LIVE · ${priorities.modelName}` : "DEMO · 휴리스틱"}
              </span>
            </div>

            <div className="grid gap-3">
              {priorities.topPriorities.map((p) => (
                <div key={p.rank} className="rounded-[20px] border border-line bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-semibold text-navy">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange text-xs font-bold text-white">{p.rank}</span>
                      {p.unit}
                    </p>
                    <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">주 {p.weeklyHours}시간</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{p.reason}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground"><strong className="text-teal">권장 행동:</strong> {p.recommendedAction}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {priorities.curriculumRoadmap.map((w) => (
                <div key={w.week} className="rounded-[20px] border border-teal/16 bg-teal/7 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-teal">Week {w.week}</p>
                  <p className="mt-1 text-base font-semibold text-navy">{w.goal}</p>
                  <ul className="mt-3 grid gap-1.5">
                    {w.activities.map((a, i) => (
                      <li key={i} className="text-sm leading-6 text-foreground">• {a}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 시험 초안 */}
      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            kicker="시험 초안"
            title="학생 데이터에 정렬된 시험"
            copy="약점·오개념을 변별 문항으로 직접 반영합니다."
          />
          <button
            type="button"
            onClick={loadExam}
            disabled={genExam}
            className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {genExam ? "생성 중..." : "시험 초안 생성"}
          </button>
        </div>

        {exam && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{exam.coverageNote}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${exam.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"}`}>
                {exam.mode === "live_ai" ? `LIVE · ${exam.modelName}` : "DEMO · 휴리스틱"}
              </span>
            </div>

            <div className="grid gap-3">
              {exam.items.map((item) => (
                <div key={item.number} className="rounded-[20px] border border-line bg-white p-4">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white">{item.number}</span>
                    <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">{item.unit}</span>
                    <span className="rounded-full bg-amber/20 px-2 py-0.5 text-xs font-semibold text-amber">{item.difficulty}</span>
                    <span className="rounded-full bg-orange/10 px-2 py-0.5 text-xs font-semibold text-orange">{item.type}</span>
                  </div>
                  <p className="font-medium text-navy leading-7">{item.question}</p>
                  <p className="mt-3 text-sm text-muted"><strong className="text-foreground">정답:</strong> {item.answer}</p>
                  <p className="mt-1 text-sm text-muted"><strong className="text-foreground">출제 의도:</strong> {item.rationale}</p>
                  {item.trapWarning && (
                    <p className="mt-2 rounded-[12px] bg-red/8 px-3 py-2 text-xs text-red">⚠ {item.trapWarning}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
