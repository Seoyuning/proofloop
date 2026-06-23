"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStudio, toggleUnit } from "@/lib/studio-context";
import { ExamQuestionCard, SectionHeader, SimpleListCard, UnitToggle } from "@/components/studio-ui";
import type { LessonKit, ExamDraft } from "@/lib/studio-generation";

function formatLessonText(kit: LessonKit): string {
  let text = `${kit.title}\n${kit.summary}\n\n`;
  for (const slide of kit.slideOutline) {
    text += `${slide.title}\n`;
    for (const b of slide.bullets) text += `  - ${b}\n`;
    text += "\n";
  }
  text += "수업 중 확인 질문:\n";
  for (const q of kit.checkQuestions) text += `  - ${q}\n`;
  text += "\n교사용 메모:\n";
  for (const m of kit.teacherMemo) text += `  - ${m}\n`;
  return text;
}

function formatExamText(draft: ExamDraft): string {
  let text = `${draft.title}\n${draft.summary}\n\n`;
  text += `예상 함정: ${draft.predictedTraps.join(", ")}\n\n`;
  for (const q of draft.questions) {
    text += `문항 ${q.number}. ${q.stem}\n`;
    const labels = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => { text += `  ${labels[i]}. ${opt}\n`; });
    text += `  정답: ${q.answer}\n  근거: ${q.rationale}\n  출처: ${q.source}\n\n`;
  }
  text += "출제 후 활용 메모:\n";
  for (const n of draft.reviewNotes) text += `  - ${n}\n`;
  return text;
}

function ExportButtons({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-navy transition-colors hover:bg-surface-strong"
      >
        {copied ? "복사됨!" : "클립보드 복사"}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal"
      >
        파일 다운로드
      </button>
    </div>
  );
}

type TeacherPracticeItem = { type: string; question: string; choices?: string[]; answer: string; solution: string };
type TeacherPracticeSet = { id: string; concept: string | null; grade_key: string | null; created_at: string; items: TeacherPracticeItem[]; attempts: number; correct: number };

function formatPracticeSet(s: TeacherPracticeSet): string {
  let t = `[맞춤 연습문제] ${s.concept || "수학"}\n\n`;
  s.items.forEach((it, i) => {
    t += `${i + 1}. ${it.question}\n`;
    if (it.choices?.length) it.choices.forEach((c, ci) => { t += `  ${ci + 1}) ${c}\n`; });
    t += `  정답: ${it.answer}\n`;
    if (it.solution) t += `  풀이: ${it.solution}\n`;
    t += "\n";
  });
  return t;
}

function TeacherModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="app-segment whitespace-nowrap rounded-[18px] px-4 py-2.5 text-sm font-semibold transition-all"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export default function TeacherGeneratePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const {
    currentBot, teacherMode, setTeacherMode, activeClassId,
    lessonUnitIds, setLessonUnitIds, lessonFocus, setLessonFocus, lessonMinutes, setLessonMinutes, lessonKit, handleLessonGenerate,
    examUnitIds, setExamUnitIds, examPurpose, setExamPurpose, examQuestionCount, setExamQuestionCount, examDraft, handleExamGenerate,
  } = useStudio();
  const [practiceSets, setPracticeSets] = useState<TeacherPracticeSet[]>([]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "teacher") { router.replace("/studio/chat"); }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!activeClassId) { setPracticeSets([]); return; }
    fetch(`/api/practice/sets?classId=${activeClassId}`)
      .then((r) => r.json())
      .then((d) => setPracticeSets(Array.isArray(d.sets) ? d.sets : []))
      .catch(() => setPracticeSets([]));
  }, [activeClassId]);

  if (isLoading || !user || user.role !== "teacher") return null;

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">수업 도구</span>
              <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                {currentBot.publisher} {currentBot.textbookName}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
              질문 DB 기반 수업 자료 생성
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              학생 질문 데이터를 강의 자료나 시험지 초안으로 즉시 변환합니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-[22px] bg-surface-strong p-1">
            <TeacherModeButton active={teacherMode === "lesson"} label="강의 자료" onClick={() => setTeacherMode("lesson")} />
            <TeacherModeButton active={teacherMode === "exam"} label="시험지 초안" onClick={() => setTeacherMode("exam")} />
          </div>
        </div>
      </header>

      {practiceSets.length > 0 && (
        <section className="app-panel rounded-[28px] p-5 sm:p-6">
          <SectionHeader
            kicker="학생 연습 데이터"
            title="학생이 푼 맞춤 연습문제"
            copy="챗봇이 학생 약점에 맞춰 출제한 문제와 정답률입니다. 시험·복습 자료로 바로 활용하세요."
          />
          <div className="app-scroll mt-6 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {practiceSets.map((s) => (
              <div key={s.id} className="rounded-[22px] border border-line bg-white/72 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{s.concept || "수학 연습"}</p>
                    <p className="mt-1 text-xs text-muted">{s.grade_key || ""} · 문제 {s.items.length}개 · {new Date(s.created_at).toLocaleDateString("ko-KR")}</p>
                  </div>
                  {s.attempts > 0 && (
                    <span className="whitespace-nowrap rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">정답 {s.correct}/{s.attempts}</span>
                  )}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-navy/70">문제·정답 보기</summary>
                  <div className="mt-2 space-y-2">
                    {s.items.map((it, i) => (
                      <div key={i} className="rounded-[14px] border border-line bg-surface-strong p-3">
                        <p className="text-sm text-navy">{i + 1}. {it.question}</p>
                        {it.choices && it.choices.length > 0 && (
                          <p className="mt-1 text-xs text-muted">보기: {it.choices.join(" / ")}</p>
                        )}
                        <p className="mt-1 text-xs font-medium text-teal">정답: {it.answer}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <ExportButtons text={formatPracticeSet(s)} filename={`연습문제_${s.concept || "수학"}.txt`} />
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}

      {teacherMode === "lesson" ? (
        <div className="space-y-4">
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="설정" title="강의 자료 구성" copy="수업 범위와 목표를 설정하고 자료를 생성합니다." />

            <div className="mt-6 rounded-[24px] border border-line bg-white/76 p-4">
              <p className="text-sm font-semibold text-navy">수업 범위</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentBot.sections.map((section) => (
                  <UnitToggle
                    key={section.id}
                    active={lessonUnitIds.includes(section.id)}
                    label={section.title}
                    onClick={() => setLessonUnitIds((c) => toggleUnit(c, section.id))}
                  />
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-navy">수업 목표</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
                    onChange={(e) => setLessonFocus(e.target.value)}
                    value={lessonFocus}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-navy">수업 시간</span>
                  <select
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
                    onChange={(e) => setLessonMinutes(Number(e.target.value))}
                    value={lessonMinutes}
                  >
                    <option value={40}>40분</option>
                    <option value={45}>45분</option>
                    <option value={50}>50분</option>
                  </select>
                </label>
              </div>

              <button
                className="mt-4 inline-flex whitespace-nowrap rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
                onClick={handleLessonGenerate}
                type="button"
              >
                강의 자료 갱신
              </button>
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6 space-y-4">
            <div className="rounded-[24px] border border-line bg-surface-strong p-4">
              <p className="text-sm font-semibold text-navy">{lessonKit.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{lessonKit.summary}</p>
            </div>

            <div className="grid gap-3">
              {lessonKit.slideOutline.map((slide) => (
                <div key={slide.title} className="rounded-[22px] border border-line bg-white/72 p-4">
                  <p className="text-sm font-semibold text-navy">{slide.title}</p>
                  <ul className="mt-3 space-y-2">
                    {slide.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-sm leading-6 text-muted">
                        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-current opacity-55" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SimpleListCard items={lessonKit.checkQuestions} title="수업 중 확인 질문" />
              <SimpleListCard items={lessonKit.teacherMemo} title="교사용 메모" />
            </div>

            <ExportButtons text={formatLessonText(lessonKit)} filename={`${lessonKit.title}.txt`} />
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="설정" title="시험지 구성" copy="시험 범위와 목적을 설정하고 초안을 생성합니다." />

            <div className="mt-6 rounded-[24px] border border-line bg-white/76 p-4">
              <p className="text-sm font-semibold text-navy">시험 범위</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentBot.sections.map((section) => (
                  <UnitToggle
                    key={section.id}
                    active={examUnitIds.includes(section.id)}
                    label={section.title}
                    onClick={() => setExamUnitIds((c) => toggleUnit(c, section.id))}
                  />
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-navy">시험 목적</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
                    onChange={(e) => setExamPurpose(e.target.value)}
                    value={examPurpose}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-navy">문항 수</span>
                  <select
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-teal"
                    onChange={(e) => setExamQuestionCount(Number(e.target.value))}
                    value={examQuestionCount}
                  >
                    <option value={1}>1문항</option>
                    <option value={2}>2문항</option>
                    <option value={3}>3문항</option>
                    <option value={5}>5문항</option>
                    <option value={10}>10문항</option>
                  </select>
                </label>
              </div>

              <button
                className="mt-4 inline-flex whitespace-nowrap rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
                onClick={handleExamGenerate}
                type="button"
              >
                시험지 초안 갱신
              </button>
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6 space-y-4">
            <div className="rounded-[24px] border border-line bg-surface-strong p-4">
              <p className="text-sm font-semibold text-navy">{examDraft.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{examDraft.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {examDraft.predictedTraps.map((trap) => (
                  <span key={trap} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-foreground">
                    {trap}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {examDraft.questions.map((question) => (
                <ExamQuestionCard key={question.number} question={question} />
              ))}
            </div>

            <SimpleListCard items={examDraft.reviewNotes} title="출제 후 활용 메모" />

            <ExportButtons text={formatExamText(examDraft)} filename={`${examDraft.title}.txt`} />
          </section>
        </div>
      )}
    </div>
  );
}
