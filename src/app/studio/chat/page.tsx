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

// 모바일에서 치기 어려운 수식 기호 — 입력바 위 빠른 삽입 툴바
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
    <div className="space-y-3 pt-6">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">P</div>
        <p className="mt-3 text-lg font-semibold text-navy">무엇이 궁금한가요?</p>
        <p className="mt-1 text-sm text-muted">교과서 단원·쪽수를 근거로 답해드려요.</p>
      </div>

      {/* 추천 질문 */}
      {canAsk && (
        <div className="flex flex-wrap justify-center gap-2 pt-2">
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
      {!canAsk && (
        <p className="text-center text-xs text-muted">반에 참여하면 바로 질문할 수 있어요.</p>
      )}
    </div>
  );
}

export default function StudentChatPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const {
    currentBot, chatInput, setChatInput, chatMessages, chatLoading, handleSendQuestion,
    activeClassId, switchBotForClass,
    chatSessions, activeChatSessionId, handleNewChatSession, handleSwitchSession,
  } = useStudio();
  const didHealClass = useRef(false);
  const [myClasses, setMyClasses] = useState<ClassRow[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // 새 메시지/로딩 시 항상 맨 아래로 부드럽게 스크롤 (위로 스크롤한 상태에서 보내도 따라 내려감)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, chatLoading]);

  if (isLoading || !user || user.role !== "student") return null;

  const recentMessages = chatMessages.slice(-12);
  const hasConversation = chatMessages.some((m) => m.role === "user");

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

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
      resizeInput();
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
        requestAnimationFrame(() => { inputRef.current?.focus(); resizeInput(); });
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
    <div className="flex h-[calc(100dvh-5rem)] flex-col lg:h-[calc(100vh-1.5rem)]">
      {/* 상단: 반 전환 + 액션 (카드 없이 플랫) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {myClasses.map((c) => {
            const active = activeClassId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => switchBotForClass(c)}
                aria-pressed={active}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active ? "bg-teal text-white shadow-sm" : "border border-line bg-white/70 text-muted hover:text-navy"
                }`}
              >
                {c.subject ? `${c.subject} · ` : ""}{c.name}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {activeClassId && (
            <button
              type="button"
              onClick={() => setWeaknessOpen(true)}
              className="whitespace-nowrap rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-teal"
            >
              📊 내 약점
            </button>
          )}
          {activeClassId && (
            <button
              type="button"
              onClick={handleNewChatSession}
              className="whitespace-nowrap rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-teal"
            >
              + 새 채팅
            </button>
          )}
          {chatSessions.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSessions(!showSessions)}
                className="whitespace-nowrap rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-teal"
              >
                기록 ▾
              </button>
              {showSessions && (
                <div className="app-scroll absolute right-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-[18px] border border-line bg-white p-2 shadow-xl">
                  {chatSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`w-full rounded-[12px] px-3 py-2 text-left text-xs transition-colors ${
                        activeChatSessionId === s.id ? "bg-teal/10 font-semibold text-teal" : "text-muted hover:bg-gray-50"
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

      {/* 메시지 — 플랫, 가운데 정렬 컬럼 */}
      <div ref={scrollRef} className="app-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-1 py-3">
          {hasConversation ? (
            recentMessages.map((message) => <MessageBubble key={message.id} message={message} />)
          ) : (
            !chatLoading && (
              <ChatOnboarding
                starterPrompts={currentBot.starterPrompts}
                onPick={(p) => { setChatInput(p); requestAnimationFrame(resizeInput); }}
                canAsk={!!activeClassId}
              />
            )
          )}
          {chatLoading && (
            <div className="flex gap-3">
              <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">P</div>
              <p className="pt-1 text-sm text-muted animate-pulse">답변을 생각하고 있어요…</p>
            </div>
          )}
        </div>
      </div>

      {/* 입력 — 둥근 바, 가운데 정렬 (아이콘 내장) */}
      <div className="shrink-0 px-1 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {activeClassId ? (
            <>
              {ocrNote && (
                <p className="mb-2 rounded-[14px] bg-teal/8 px-4 py-2 text-xs leading-5 text-navy">{ocrNote}</p>
              )}
              {/* 수식 툴바 */}
              <div className="app-scroll mb-2 flex gap-1 overflow-x-auto pb-0.5">
                {MATH_SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    tabIndex={-1}
                    onClick={() => insertSymbol(s)}
                    aria-label={`${s} 입력`}
                    className="shrink-0 rounded-lg border border-line bg-white px-2.5 py-1 text-sm text-navy transition-colors hover:border-teal hover:bg-teal/8"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {/* 입력 바 */}
              <div className="flex items-end gap-1.5 rounded-[26px] border border-line bg-white p-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={ocrLoading}
                  aria-label="사진으로 질문"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-lg transition-colors hover:bg-surface-strong disabled:opacity-50"
                >
                  {ocrLoading ? "…" : "📷"}
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="max-h-40 min-h-[1.75rem] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-7 outline-none placeholder:text-muted/60"
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    // 한글 IME 조합 중에는 Enter로 보내지 않음 (마지막 글자 잔류 버그 방지)
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSendQuestion();
                    }
                  }}
                  placeholder="질문을 입력하세요 (수식은 말로 써도 돼요)"
                  value={chatInput}
                />
                <button
                  type="button"
                  onClick={handleSendQuestion}
                  disabled={chatLoading || !chatInput.trim()}
                  aria-label="보내기"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-orange text-base font-bold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↑
                </button>
              </div>
              <p className="mt-1.5 px-2 text-center text-[11px] text-muted/60">
                📷로 인쇄·또박또박 손글씨 문제를 찍어 물어볼 수 있어요.
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
              />
            </>
          ) : (
            <div className="rounded-[20px] border border-orange/20 bg-orange/5 p-5 text-center">
              <p className="text-sm font-semibold text-navy">반에 먼저 참여해 주세요</p>
              <p className="mt-2 text-sm text-muted">사이드바에서 선생님이 알려준 초대 코드를 입력하면 챗봇을 사용할 수 있어요.</p>
            </div>
          )}
        </div>
      </div>

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
