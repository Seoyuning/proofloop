"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStudio } from "@/lib/studio-context";
import { MessageBubble, SectionHeader } from "@/components/studio-ui";

type WeakSection = {
  sectionTitle: string;
  questionCount: number;
  avgUnderstanding: number;
  misconceptions: string[];
};

/** 대화 시작 전 빈 화면을 채우는 온보딩: 추천 질문 + 답변 예시(가치 미리보기) */
function ChatOnboarding({
  starterPrompts,
  onPick,
  canAsk,
}: {
  starterPrompts: string[];
  onPick: (prompt: string) => void;
  canAsk: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* 추천 질문 */}
      <div className="rounded-[24px] border border-line bg-white/72 p-5">
        <p className="text-sm font-semibold text-navy">💡 이렇게 물어보세요</p>
        <p className="mt-1 text-xs text-muted">
          {canAsk ? "아래를 누르면 질문칸에 채워집니다." : "반에 참여하면 바로 질문할 수 있어요."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={!canAsk}
              onClick={() => onPick(prompt)}
              className="rounded-full border border-teal/30 bg-teal/5 px-3.5 py-2 text-xs font-medium text-teal transition-colors hover:bg-teal/12 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* 답변 예시 — 핵심 가치(근거 기반 답변) 미리보기 */}
      <div className="rounded-[24px] border border-line bg-white/72 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-semibold text-orange">예시</span>
          <p className="text-sm font-semibold text-navy">답변은 이렇게 옵니다</p>
        </div>
        <div className="mt-3 space-y-2.5">
          <div className="rounded-[18px] bg-navy/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">질문</p>
            <p className="mt-1 text-sm text-navy">이차함수 표준형 y=a(x-p)²+q에서 꼭짓점이 왜 (p, q)예요?</p>
          </div>
          <div className="rounded-[18px] border border-line bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">답변</p>
            <p className="mt-1 text-sm leading-6 text-navy">
              (x-p)²은 항상 0 이상이라 x=p일 때 최소 0이 되고, 그때 y=q가 됩니다. 그래서 그래프가 꺾이는 꼭짓점이 (p, q)예요.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
              📎 근거 · 3단원 이차함수 / p.84
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted/70">모든 답변은 교과서 단원·쪽수 근거와 함께 제공됩니다.</p>
      </div>
    </div>
  );
}

export default function StudentChatPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const {
    currentBot, chatInput, setChatInput, chatMessages, chatLoading, handleSendQuestion,
    activeClassId, activeClassSubject,
    chatSessions, activeChatSessionId, handleNewChatSession, handleSwitchSession,
  } = useStudio();
  const [showSessions, setShowSessions] = useState(false);
  const [weakSections, setWeakSections] = useState<WeakSection[]>([]);
  const [weakLoading, setWeakLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "student") { router.replace("/studio/analysis"); }
  }, [user, isLoading, router]);

  // Load weakness report when class changes
  useEffect(() => {
    if (!activeClassId) return;
    setWeakLoading(true);
    fetch(`/api/student/weakness?classId=${activeClassId}`)
      .then((r) => r.json())
      .then((d) => setWeakSections(d.weakSections ?? []))
      .catch(() => setWeakSections([]))
      .finally(() => setWeakLoading(false));
  }, [activeClassId]);

  if (isLoading || !user || user.role !== "student") return null;

  const recentMessages = chatMessages.slice(-12);
  const hasConversation = chatMessages.some((m) => m.role === "user");
  const studentGrade = user.grade ?? "학생";
  const chatTitle = activeClassId && activeClassSubject
    ? `${studentGrade} ${activeClassSubject} 챗봇`
    : `${studentGrade} 챗봇`;
  const chatDescription = activeClassId && activeClassSubject
    ? "질문을 보내면 교과서 단원과 쪽수를 근거로 답변합니다. 이해가 안 되는 부분을 자유롭게 물어보세요."
    : "반에 참여하면 교과서 범위 안에서 근거를 포함한 답변을 받을 수 있습니다. 먼저 사이드바에서 반에 참여해 보세요.";

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">Grounded Answering</span>
          {activeClassId && currentBot.publisher && (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
              {currentBot.publisher} {currentBot.textbookName}
            </span>
          )}
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
          {chatTitle}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          {chatDescription}
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeader
            kicker="학생 대화"
            title="질문과 답변"
            copy="교과서 범위 안에서 근거를 포함해 답변합니다. 질문은 자동으로 데이터에 누적됩니다."
          />
          <div className="flex items-center gap-2">
            {activeClassId && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-navy px-4 py-2.5 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
                onClick={handleNewChatSession}
              >
                + 새 채팅
              </button>
            )}
            {chatSessions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  className="rounded-[20px] border border-line bg-white px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:border-teal"
                  onClick={() => setShowSessions(!showSessions)}
                >
                  대화 {recentMessages.length}건 {showSessions ? "▲" : "▼"}
                </button>
                {showSessions && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 max-h-60 overflow-y-auto rounded-[18px] border border-line bg-white p-2 shadow-xl">
                    {chatSessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`w-full rounded-[12px] px-3 py-2 text-left text-xs transition-colors ${
                          activeChatSessionId === s.id
                            ? "bg-teal/10 font-semibold text-teal"
                            : "text-muted hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          handleSwitchSession(s.id);
                          setShowSessions(false);
                        }}
                      >
                        <p className="truncate">{s.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted/60">
                          {new Date(s.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {chatSessions.length === 0 && (
              <div className="rounded-[20px] border border-line bg-white px-4 py-3 text-sm text-muted">
                대화 {recentMessages.length}건
              </div>
            )}
          </div>
        </div>

        <div className="app-scroll mt-6 max-h-[60vh] sm:max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {hasConversation ? (
            recentMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            !chatLoading && (
              <ChatOnboarding
                starterPrompts={currentBot.starterPrompts}
                onPick={setChatInput}
                canAsk={!!activeClassId}
              />
            )
          )}
          {chatLoading && (
            <div className="rounded-[26px] border border-line bg-white/72 p-4">
              <p className="text-sm font-semibold text-navy">교과서 챗봇</p>
              <p className="mt-3 text-sm text-muted animate-pulse">답변을 생성하고 있습니다...</p>
            </div>
          )}
        </div>

        {activeClassId ? (
          <div className="mt-6 rounded-[24px] border border-line bg-white/82 p-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-navy">질문 입력</span>
              <textarea
                className="w-full rounded-[20px] border border-line bg-white px-4 py-3 text-sm leading-7 outline-none transition-colors placeholder:text-muted/70 focus:border-teal"
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuestion();
                  }
                }}
                placeholder={currentBot.starterPrompts[0]}
                rows={3}
                value={chatInput}
              />
            </label>

            <div className="mt-4 flex items-center justify-end">
              <button
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleSendQuestion}
                disabled={chatLoading}
                type="button"
              >
                {chatLoading ? "답변 생성 중..." : "질문 보내기"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-[24px] border border-orange/20 bg-orange/5 p-5 text-center">
            <p className="text-sm font-semibold text-navy">반에 먼저 참여해 주세요</p>
            <p className="mt-2 text-sm text-muted">사이드바에서 선생님이 알려준 초대 코드를 입력하면 해당 교과서 챗봇을 사용할 수 있습니다.</p>
          </div>
        )}
      </section>

      {/* Weakness Report */}
      {activeClassId && (
        <section className="app-panel rounded-[28px] p-5 sm:p-6">
          <SectionHeader
            kicker="학습 분석"
            title="내 약점 리포트"
            copy="질문 데이터를 기반으로 이해도가 낮은 단원을 보여줍니다."
          />

          {weakLoading ? (
            <div className="mt-6 text-sm text-muted animate-pulse">분석 중...</div>
          ) : weakSections.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-line bg-surface-strong p-4 text-center">
              <p className="text-sm text-muted">질문을 더 보내면 약점 리포트가 생성됩니다.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {weakSections.map((section) => (
                <div key={section.sectionTitle} className="rounded-[20px] border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy">{section.sectionTitle}</p>
                      <p className="mt-1 text-xs text-muted">질문 {section.questionCount}건</p>
                    </div>
                    {section.avgUnderstanding > 0 && (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div
                              key={level}
                              className={`h-2 w-5 rounded-full ${
                                level <= Math.round(section.avgUnderstanding)
                                  ? section.avgUnderstanding >= 4 ? "bg-teal" : section.avgUnderstanding >= 3 ? "bg-orange" : "bg-red-400"
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-muted">
                          평균 이해도 {section.avgUnderstanding}
                        </span>
                      </div>
                    )}
                  </div>
                  {section.misconceptions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {section.misconceptions.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-medium text-orange"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
