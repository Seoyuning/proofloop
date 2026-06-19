"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStudio } from "@/lib/studio-context";
import { InfoBlock, SectionHeader } from "@/components/studio-ui";

/** 질문 데이터가 아직 없을 때 보여주는 '예시' 미리보기 (실데이터가 쌓이면 교체됨) */
const SAMPLE_CLUSTERS = [
  {
    q: "이차함수 표준형에서 꼭짓점이 왜 (p, q)예요?",
    unit: "3단원 이차함수 · p.84",
    freq: 12,
    misconception: "p의 부호를 그대로 옮기는 실수",
    action: "표준형→꼭짓점 변환 1문제 즉석 풀이",
  },
  {
    q: "판별식 D<0이면 왜 실근이 없나요?",
    unit: "2단원 이차방정식 · p.58",
    freq: 8,
    misconception: "판별식 부호와 근의 개수 관계 혼동",
    action: "D 부호별 그래프 위치 비교 설명",
  },
  {
    q: "완전제곱식 만들 때 더하고 빼는 게 헷갈려요",
    unit: "3단원 이차함수 · p.80",
    freq: 6,
    misconception: "상수항 보정(±) 누락",
    action: "단계별 완전제곱 절차 체크리스트 제공",
  },
];

interface UploadedMaterial {
  id: string;
  name: string;
  type: "image" | "file";
  url: string;
  addedAt: string;
}

type AnalysisTab = "class" | "student";

interface SectionStat {
  sectionTitle: string;
  avgUnderstanding: number;
  questionCount: number;
}

interface DashboardData {
  totalQuestions: number;
  totalStudents: number;
  topMisconception: string;
  misconceptionRanking: Array<{ misconception: string; count: number }>;
  sectionStats: SectionStat[];
}

export default function TeacherAnalysisPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { currentBot, currentClusters, currentQuestionVolume, topClusters, currentStudentWeaknesses } = useStudio();
  const [tab, setTab] = useState<AnalysisTab>("class");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [materials, setMaterials] = useState<UploadedMaterial[]>([]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(files: FileList | null) {
    if (!files) return;
    const newMaterials: UploadedMaterial[] = Array.from(files).map((f) => ({
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      type: f.type.startsWith("image/") ? "image" : "file",
      url: URL.createObjectURL(f),
      addedAt: new Date().toLocaleString("ko-KR"),
    }));
    setMaterials((prev) => [...newMaterials, ...prev]);
    setShowUploadMenu(false);
  }

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => {
      if (!d.error) setDashboard(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "teacher") { router.replace("/studio/chat"); }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== "teacher") return null;

  const seedBotIds = ["high-math-bisang", "middle-science-mirae", "high-korean-chunjae"];
  const isSeedData = seedBotIds.includes(currentBot.id);
  const isEmpty = currentClusters.length === 0;

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">질문 분석</span>
              {currentBot.publisher && (
                <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                  {currentBot.publisher} {currentBot.textbookName}
                </span>
              )}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
              {currentBot.publisher ? `${currentBot.grade} ${currentBot.subject} 질문 분석 대시보드` : "질문 분석 대시보드"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              {currentBot.publisher
                ? "학생이 실제로 어떤 질문을 반복하는지, 어떤 오개념이 발생하는지 데이터로 확인합니다."
                : "사이드바에서 반을 선택하면 해당 반의 질문 데이터를 확인할 수 있습니다."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="group relative overflow-hidden rounded-[22px] border border-line bg-white/90 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-teal/8" />
              <p className="relative text-xs font-bold uppercase tracking-[0.1em] text-muted">누적 질문</p>
              <p className="relative mt-3 text-2xl font-bold tabular-nums tracking-tight text-navy">{dashboard?.totalQuestions ?? currentQuestionVolume}<span className="ml-0.5 text-sm font-semibold text-muted">회</span></p>
            </div>
            <div className="group relative overflow-hidden rounded-[22px] border border-line bg-white/90 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-amber/10" />
              <p className="relative text-xs font-bold uppercase tracking-[0.1em] text-muted">참여 학생</p>
              <p className="relative mt-3 text-2xl font-bold tabular-nums tracking-tight text-navy">{dashboard?.totalStudents ?? 0}<span className="ml-0.5 text-sm font-semibold text-muted">명</span></p>
            </div>
            <div className="group relative overflow-hidden rounded-[22px] border border-line bg-white/90 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-orange/8" />
              <p className="relative text-xs font-bold uppercase tracking-[0.1em] text-muted">상위 오개념</p>
              <p className="relative mt-3 text-sm font-bold leading-5 text-navy">{dashboard?.topMisconception ?? topClusters[0]?.misconception ?? "없음"}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 빈 상태 온보딩 — 데이터가 없을 때 시작 흐름 안내 */}
      {isEmpty && (
        <section className="app-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚀</span>
                <p className="text-base font-semibold text-navy">3단계로 시작하기</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-3 py-1.5 text-xs font-medium text-navy">
                  <b className="text-teal">①</b> 반 만들기
                </span>
                <span className="text-muted/40">→</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-3 py-1.5 text-xs font-medium text-navy">
                  <b className="text-teal">②</b> 초대 코드로 학생 참여
                </span>
                <span className="text-muted/40">→</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-3 py-1.5 text-xs font-medium text-navy">
                  <b className="text-teal">③</b> 질문이 쌓이면 자동 분석
                </span>
              </div>
            </div>
            <Link
              href="/studio/classes"
              className="whitespace-nowrap rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal"
            >
              반 만들러 가기 →
            </Link>
          </div>
        </section>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            tab === "class" ? "bg-navy text-white shadow-lg" : "border border-line bg-white text-foreground hover:border-teal/40"
          }`}
          onClick={() => setTab("class")}
          type="button"
        >
          반 전체 공통 약점
        </button>
        <button
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            tab === "student" ? "bg-navy text-white shadow-lg" : "border border-line bg-white text-foreground hover:border-teal/40"
          }`}
          onClick={() => setTab("student")}
          type="button"
        >
          학생별 약점
        </button>
      </div>

      {/* 챕터별 이해도 */}
      {dashboard?.sectionStats && dashboard.sectionStats.length > 0 && (
        <section className="app-panel rounded-[28px] p-5 sm:p-6">
          <SectionHeader
            kicker="챕터별 데이터"
            title="단원별 평균 이해도"
            copy="학생들의 질문 데이터에서 단원별 평균 이해 수준을 집계합니다."
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.sectionStats.map((s) => (
              <div key={s.sectionTitle} className="rounded-[22px] border border-line bg-white/72 p-4">
                <p className="text-sm font-semibold text-navy">{s.sectionTitle}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`h-2.5 w-5 rounded-full ${
                            level <= Math.round(s.avgUnderstanding)
                              ? s.avgUnderstanding >= 4 ? "bg-teal" : s.avgUnderstanding >= 3 ? "bg-orange" : "bg-red-400"
                              : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-bold tabular-nums text-navy">{s.avgUnderstanding}</span>
                    <span className="text-xs text-muted">/5</span>
                  </div>
                  <span className="rounded-full bg-navy/8 px-2.5 py-1 text-xs font-medium text-navy">{s.questionCount}건</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "class" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeader
                kicker="질문 DB"
                title={isSeedData ? "통합 질문 클러스터 (예시)" : "통합 질문 클러스터"}
                copy={isSeedData
                  ? "아래 데이터는 시연용 예시입니다. 실제 학생이 질문하면 이 자리에 실데이터가 쌓입니다."
                  : "학생이 실제로 어떤 질문을 반복하는지, 어떤 오개념으로 묶이는지 바로 확인합니다."}
              />
              <div className="flex items-center gap-2">
                {(isSeedData || isEmpty) && (
                  <span className="whitespace-nowrap rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">
                    {isSeedData ? "예시 데이터" : "예시 미리보기"}
                  </span>
                )}
                <div className="rounded-[20px] border border-line bg-white px-4 py-3 text-sm text-muted">
                  클러스터 {currentClusters.length}개
                </div>
              </div>
            </div>

            <div className="app-scroll mt-6 max-h-[600px] space-y-3 overflow-y-auto pr-1">
              {isEmpty ? (
                <>
                  {SAMPLE_CLUSTERS.map((c) => (
                    <div key={c.q} className="rounded-[22px] border border-dashed border-line bg-white/45 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-navy/75">{c.q}</p>
                          <p className="mt-1 text-sm text-muted">{c.unit}</p>
                        </div>
                        <span className="whitespace-nowrap rounded-full bg-navy/40 px-3 py-1 text-xs font-medium text-white">
                          {c.freq}회
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                        <InfoBlock label="오개념 태그" value={c.misconception} />
                        <InfoBlock label="교사용 액션" value={c.action} />
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-center text-xs text-muted/60">
                    위는 예시입니다. 실제 학생 질문이 쌓이면 이 자리에 자동으로 교체됩니다.
                  </p>
                </>
              ) : (
                currentClusters.map((cluster) => {
                  const section = currentBot.sections.find((s) => s.id === cluster.sectionId);
                  return (
                    <div key={cluster.id} className="rounded-[22px] border border-line bg-white/72 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-navy">{cluster.representativeQuestion}</p>
                          <p className="mt-1 text-sm text-muted">
                            {section?.title ?? "단원 미지정"} / {section?.pages ?? ""}
                          </p>
                        </div>
                        <span className="rounded-full bg-navy px-3 py-1 text-xs font-medium text-white">
                          {cluster.frequency}회
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                        <InfoBlock label="오개념 태그" value={cluster.misconception} />
                        <InfoBlock label="교사용 액션" value={cluster.teacherAction} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeader
                kicker="교과서 범위"
                title={isSeedData ? `${currentBot.publisher} ${currentBot.textbookName} (예시)` : `${currentBot.publisher} ${currentBot.textbookName}`}
                copy={isSeedData
                  ? "아래 단원 데이터는 시연용 예시입니다. 실제 서비스에서는 교과서 데이터가 연동됩니다."
                  : "학생 답변의 근거가 되는 교과서 단원과 내용입니다."}
              />
              <div className="relative">
                <button
                  type="button"
                  className="whitespace-nowrap rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal"
                  onClick={() => setShowUploadMenu(!showUploadMenu)}
                >
                  + 자료 추가
                </button>
                {showUploadMenu && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[18px] border border-line bg-white p-2 shadow-xl">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-navy transition-colors hover:bg-surface-strong"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <span className="text-base">📷</span> 사진 촬영
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-navy transition-colors hover:bg-surface-strong"
                      onClick={() => { fileInputRef.current?.setAttribute("accept", "image/*"); fileInputRef.current?.click(); }}
                    >
                      <span className="text-base">🖼️</span> 사진 선택
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-navy transition-colors hover:bg-surface-strong"
                      onClick={() => { fileInputRef.current?.setAttribute("accept", ".pdf,.doc,.docx,.txt,.hwp"); fileInputRef.current?.click(); }}
                    >
                      <span className="text-base">📄</span> 파일 올리기
                    </button>
                    <button
                      type="button"
                      className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-strong"
                      onClick={() => setShowUploadMenu(false)}
                    >
                      닫기
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileSelected(e.target.files)} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileSelected(e.target.files)} />
              </div>
            </div>

            {/* 추가된 자료 목록 */}
            {materials.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted">추가된 학습 자료</p>
                {materials.map((mat) => (
                  <div key={mat.id} className="flex items-center justify-between rounded-[16px] border border-line bg-surface-strong p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{mat.type === "image" ? "🖼️" : "📄"}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">{mat.name}</p>
                        <p className="text-xs text-muted">{mat.addedAt}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ml-2 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-red-300 hover:text-red-500"
                      onClick={() => setMaterials((prev) => prev.filter((m) => m.id !== mat.id))}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="app-scroll mt-6 max-h-[600px] space-y-3 overflow-y-auto pr-1">
              {currentBot.sections.length > 0 ? currentBot.sections.map((section) => (
                <div key={section.id} className="rounded-[22px] border border-line bg-white/72 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-navy">{section.title}</p>
                      <p className="mt-1 text-sm text-muted">{section.pages}</p>
                    </div>
                    <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">교과서 근거</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{section.summary}</p>
                  <div className="mt-4 grid gap-3">
                    <InfoBlock label="답변 기준" value={section.citationFocus} />
                    <InfoBlock label="교사용 연결 포인트" value={section.teacherBridge} />
                  </div>
                </div>
              )) : (
                <div className="rounded-[22px] border border-navy/10 bg-white p-6 text-center">
                  <p className="text-2xl">📚</p>
                  <p className="mt-3 text-base font-semibold text-navy">교과서 학습 콘텐츠 준비 중</p>
                  <p className="mt-2 text-sm leading-6 text-muted">출판사 공식 API 및 교육부 디지털교과서 플랫폼과의 연동을 준비하고 있습니다. 곧 이 교과서의 단원별 학습 콘텐츠가 자동으로 채워집니다.</p>
                  <p className="mt-4 text-xs text-muted/60">지금은 상단의 "+ 자료 추가"로 직접 학습 자료를 올릴 수 있습니다.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              kicker="학생별 약점"
              title="개인별 약점 트래킹"
              copy="학생 개개인이 어떤 개념에서 반복적으로 어려움을 겪는지 확인합니다."
            />

            <div className="app-scroll mt-6 max-h-[700px] space-y-4 overflow-y-auto pr-1">
              {currentStudentWeaknesses.length === 0 ? (
                <p className="text-sm text-muted">이 교과서에 대한 학생별 약점 데이터가 아직 없습니다.</p>
              ) : (
                currentStudentWeaknesses.map((sw) => {
                  const totalQuestions = sw.weakConcepts.reduce((t, c) => t + c.questionCount, 0);
                  return (
                    <div key={sw.id} className="rounded-[22px] border border-line bg-white/72 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
                            {sw.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-base font-semibold text-navy">{sw.studentName}</p>
                            <p className="text-sm text-muted">약점 {sw.weakConcepts.length}개 · 질문 {totalQuestions}건</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {sw.weakConcepts.map((wc) => {
                          const section = currentBot.sections.find((s) => s.id === wc.sectionId);
                          return (
                            <div key={wc.sectionId} className="rounded-[18px] border border-line bg-surface-strong p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-navy">{section?.title ?? "단원 미지정"}</p>
                                  <p className="mt-1 text-xs text-muted">{wc.misconception}</p>
                                </div>
                                <span className="whitespace-nowrap rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">
                                  {wc.questionCount}회 반복
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-muted">
                                최근 질문: &ldquo;{wc.lastQuestion}&rdquo;
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
