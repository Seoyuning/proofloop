"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStudio } from "@/lib/studio-context";
import { MessageBubble } from "@/components/studio-ui";

type WeakSection = {
  sectionTitle: string;
  questionCount: number;
  avgUnderstanding: number;
  misconceptions: string[];
};

type ClassRow = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  publisher: string;
  textbookName: string;
};

// 모바일에서 치기 어려운 수식 기호 — 입력창 위 빠른 삽입 툴바
const MATH_SYMBOLS = ["²", "³", "√", "^", "×", "÷", "π", "≤", "≥", "≠", "±", "°", "½", "⅓", "∞"];

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
    <div className="mx-auto w-full max-w-2xl space-y-3">
      {/* 추천 질문 */}
      <div className="rounded-[24px] border border-line bg-white/72 p-5">
        <p className="text-sm font-semibold text-navy">💡 이렇게 물어보세요</p>
        <p className="mt-1 text-xs text-muted">
          {canAsk ? "아래를 누르면 질문칸에 채워집니다." : "반에 참여하면 바로 질문할 수 있어요."}
        </p>
        {canAsk && (
          <div className="mt-3 flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPick(prompt)}
                className="rounded-full border border-teal/30 bg-teal/5 px-3.5 py-2 text-xs font-medium text-teal transition-colors hover:bg-teal/12"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
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
    activeClassId, activeClassSubject, switchBotForClass,
    chatSessions, activeChatSessionId, handleNewChatSession, handleSwitchSession,
  } = useStudio();
  const didHealClass = useRef(false);
  const [myClasses, setMyClasses] = useState<ClassRow[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [weaknessOpen, setWeaknessOpen] = useState(false);
  const [weakSections, setWeakSections] = useState<WeakSection[]>([]);
  const [weakLoading, setWeakLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "student") { router.replace("/studio/analysis"); }
  }, [user, isLoading, router]);

  // 참여한 반 목록을 받아와 전환 스위처에 채우고, active class가 없으면 첫 반을 선택(self-heal).
  useEffect(() => {
    if (didHealClass.current) return;
    didHealClass.current = true;
    fetch("/api/classes")
      .then((r) => r.json())
      .then((d) => {
        const list: ClassRow[] = (d.classes ?? []).map(
          (c: { id: string; name?: string; subject?: string; grade?: string; publisher?: string; textbook_name?: string }) => ({
            id: c.id,
            name: c.name ?? "",
            subject: c.subject ?? "",
            grade: c.grade ?? "",
            publisher: c.publisher ?? "",
            textbookName: c.textbook_name ?? "",
          }),
        );
        setMyClasses(list);
        if (!activeClassId && list[0]) switchBotForClass(list[0]);
      })
      .catch(() => {});
  }, [activeClassId, switchBotForClass]);

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

  function insertSymbol(sym: string) {
    const el = inputRef.current;
    if (!el) {
      setChatInput(chatInput + sym);
      return;
    }
    const start = el.selectionStart ?? chatInput.length;
    const end = el.selectionEnd ?? chatInput.length;
    setChatInput(chatInput.slice(0, start) + sym + chatInput.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + sym.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // 사진으로 질문: Upstage OCR로 인식 → 입력창에 넣어 학생이 확인/수정 후 전송 (바로 보내지 않음)
  async function handlePhoto(file: File | null) {
    if (!file) return;
    setOcrLoading(true);
    setOcrNote(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "student-photo");
      const res = await fetch("/api/document-parse", { method: "POST", body: fd });
      const data = await res.json();
      const text = ((data.elements ?? []) as Array<{ text?: string }>)
        .map((e) => e?.text ?? "")
        .join("\n")
        .trim();
      if (text) {
        setChatInput(chatInput ? `${chatInput}\n${text}` : text);
        setOcrNote("사진에서 문제를 인식했어요. 맞는지 확인하고 보내세요.");
        inputRef.current?.focus();
      } else {
        setOcrNote("사진에서 글자를 찾지 못했어요. 또박또박 다시 찍거나 직접 입력해 주세요.");
      }
    } catch {
      setOcrNote("사진 인식에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOcrLoading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-3 lg:h-[calc(100vh-1.5rem)]">
      {/* 상단 바 — 제목 + 반 전환 + 액션 */}
      <header className="app-panel shrink-0 rounded-[24px] px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-[-0.02em] text-navy sm:text-xl">{chatTitle}</h2>
            {activeClassId && currentBot.publisher && (
              <span className="hidden whitespace-nowrap rounded-full bg-teal/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal sm:inline">
                {currentBot.publisher} {currentBot.textbookName}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeClassId && (
              <button
                type="button"
                onClick={() => setWeaknessOpen(true)}
                className="whitespace-nowrap rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-navy transition-colors hover:border-teal"
              >
                📊 내 약점
              </button>
            )}
            {activeClassId && (
              <button
                type="button"
                onClick={handleNewChatSession}
                className="whitespace-nowrap rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                + 새 채팅
              </button>
            )}
            {chatSessions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  className="whitespace-nowrap rounded-full border border-line bg-white px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-teal"
                  onClick={() => setShowSessions(!showSessions)}
                >
                  기록 {showSessions ? "▲" : "▼"}
                </button>
                {showSessions && (
                  <div className="app-scroll absolute right-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-[18px] border border-line bg-white p-2 shadow-xl">
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
                        <p className="mt-0.5 text-[10px] text-muted/60">{new Date(s.created_at).toLocaleDateString("ko-KR")}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 반 전환 스위처 */}
        {myClasses.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">현재 반</span>
            {myClasses.map((c) => {
              const active = activeClassId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => switchBotForClass(c)}
                  aria-pressed={active}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    active ? "bg-teal text-white shadow-md" : "border border-line bg-white text-muted hover:border-teal/40 hover:text-navy"
                  }`}
                >
                  {c.subject ? `${c.subject} · ` : ""}{c.name}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* 메시지 — 남는 공간을 채움 */}
      <div className="app-panel app-scroll flex-1 space-y-3 overflow-y-auto rounded-[24px] p-4 sm:p-5">
        {hasConversation ? (
          recentMessages.map((message) => <MessageBubble key={message.id} message={message} />)
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

      {/* 입력 — 하단 고정 */}
      {activeClassId ? (
        <div className="app-panel shrink-0 rounded-[24px] p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {MATH_SYMBOLS.map((s) => (
              <button
                key={s}
                type="button"
                tabIndex={-1}
                onClick={() => insertSymbol(s)}
                className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-navy transition-colors hover:border-teal hover:bg-teal/8"
                aria-label={`${s} 입력`}
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            ref={inputRef}
            className="w-full resize-none rounded-[18px] border border-line bg-white px-4 py-3 text-sm leading-7 outline-none transition-colors placeholder:text-muted/70 focus:border-teal"
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              // 한글 IME 조합 중에는 Enter로 보내지 않음 (마지막 글자가 입력칸에 남는 버그 방지)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSendQuestion();
              }
            }}
            placeholder={currentBot.starterPrompts[0]}
            rows={2}
            value={chatInput}
          />
          {ocrNote && (
            <p className="mt-2 rounded-[14px] bg-teal/8 px-4 py-2.5 text-xs leading-5 text-navy">{ocrNote}</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={ocrLoading}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:border-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ocrLoading ? "인식 중…" : "📷 사진으로 질문"}
            </button>
            <button
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSendQuestion}
              disabled={chatLoading}
              type="button"
            >
              {chatLoading ? "답변 생성 중..." : "보내기"}
            </button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="app-panel shrink-0 rounded-[24px] p-5 text-center">
          <p className="text-sm font-semibold text-navy">반에 먼저 참여해 주세요</p>
          <p className="mt-2 text-sm text-muted">사이드바에서 선생님이 알려준 초대 코드를 입력하면 해당 교과서 챗봇을 사용할 수 있습니다.</p>
        </div>
      )}

      {/* 내 약점 리포트 — 우측 드로어 */}
      {weaknessOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/40" onClick={() => setWeaknessOpen(false)}>
          <aside
            className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="eyebrow text-xs text-muted">학습 분석</p>
                <h3 className="text-lg font-semibold text-navy">내 약점 리포트</h3>
              </div>
              <button
                type="button"
                onClick={() => setWeaknessOpen(false)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-teal hover:text-navy"
              >
                ✕
              </button>
            </div>
            <div className="app-scroll flex-1 overflow-y-auto p-5">
              <p className="text-sm text-muted">질문 데이터를 기반으로 이해도가 낮은 단원을 보여줍니다.</p>
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
                            <span className="text-[10px] text-muted">평균 이해도 {section.avgUnderstanding}</span>
                          </div>
                        )}
                      </div>
                      {section.misconceptions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {section.misconceptions.slice(0, 3).map((m) => (
                            <span key={m} className="rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-medium text-orange">{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
