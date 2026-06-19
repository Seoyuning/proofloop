"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { textbookBots, type TextbookBot } from "@/lib/studio-data";
import { getSubjectTextbooks, getPublishersForSubject, type CatalogTextbook } from "@/lib/textbook-catalog";
import { StudioProvider, useStudio } from "@/lib/studio-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-white/8 bg-black/12 px-3 py-2.5">
      <span className="text-sm text-white/68">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const studentNavSections: NavSection[] = [
  {
    title: "학습",
    items: [
      { href: "/studio/chat", label: "질문하기", icon: "💬" },
      { href: "/studio/reasoning", label: "풀이 채점", icon: "✍️", badge: "EXAONE" },
      { href: "/studio/visual", label: "개념 시각화", icon: "🎨", badge: "VARCO" },
    ],
  },
  {
    title: "내 정보",
    items: [
      { href: "/studio/mypage", label: "마이페이지", icon: "👤" },
    ],
  },
];

function JoinClassWidget() {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [joinedClasses, setJoinedClasses] = useState<Array<{ id: string; name: string; subject: string; grade: string; publisher: string; textbookName: string }>>([]);
  const { switchBotForClass, activeClassId } = useStudio();
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    fetch("/api/classes").then((r) => r.json()).then((d) => {
      const cls = d.classes?.map((c: any) => ({
        id: c.id, name: c.name, subject: c.subject ?? "",
        grade: c.grade ?? "", publisher: c.publisher ?? "", textbookName: c.textbook_name ?? "",
      })) ?? [];
      setJoinedClasses(cls);
      // Auto-select first class
      if (cls.length > 0) switchBotForClass(cls[0]);
    }).catch(() => {});
  }, [switchBotForClass]);

  async function handleJoin() {
    if (!code.trim()) return;
    setJoining(true);
    setMessage(null);
    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "ok", text: `"${data.class.name}" 반에 참여했습니다!` });
        const newClass = {
          id: data.class.id, name: data.class.name, subject: data.class.subject ?? "",
          grade: data.class.grade ?? "", publisher: data.class.publisher ?? "", textbookName: data.class.textbook_name ?? "",
        };
        setJoinedClasses((c) => [...c, newClass]);
        switchBotForClass(newClass);
        setCode("");
      }
    } catch {
      setMessage({ type: "error", text: "서버에 연결할 수 없습니다." });
    } finally {
      setJoining(false);
    }
  }

  // Group by subject
  const grouped = joinedClasses.reduce<Record<string, typeof joinedClasses>>((acc, c) => {
    const key = c.subject || "기타";
    (acc[key] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="mt-5">
      {/* Join input — always visible at top */}
      <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
        <p className="text-sm font-semibold">반 참여</p>
        <p className="mt-1 text-xs text-white/50">선생님이 알려준 초대 코드를 입력하세요</p>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-sm tracking-widest text-white placeholder:text-white/40 placeholder:tracking-normal outline-none focus:border-teal"
            placeholder="초대 코드"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          />
          <button
            className="whitespace-nowrap rounded-full bg-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal/80 disabled:opacity-60"
            onClick={handleJoin}
            disabled={joining || !code.trim()}
            type="button"
          >
            {joining ? "..." : "참여"}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-xs ${message.type === "ok" ? "text-teal" : "text-orange"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Joined classes — subject buttons */}
      {joinedClasses.length > 0 ? (
        <div className="mt-3 rounded-[22px] border border-white/10 bg-white/6 p-4">
          <p className="text-sm font-semibold">내 반</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {joinedClasses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  activeClassId === c.id
                    ? "bg-teal text-white shadow-lg"
                    : "border border-white/10 bg-white/6 text-white/72 hover:bg-white/12"
                }`}
                onClick={() => switchBotForClass(c)}
              >
                {c.subject} · {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[18px] border border-orange/20 bg-orange/5 p-3">
          <p className="text-xs text-white/72">반에 참여해야 챗봇을 사용할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}

function StudentSessionList() {
  const { chatSessions, activeChatSessionId, handleSwitchSession, handleNewChatSession, activeClassId } = useStudio();

  if (!activeClassId || chatSessions.length === 0) return null;

  return (
    <div className="mt-3 rounded-[22px] border border-white/10 bg-white/6 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">대화 기록</p>
        <button
          type="button"
          className="text-xs text-teal hover:underline"
          onClick={handleNewChatSession}
        >
          + 새 대화
        </button>
      </div>
      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto app-scroll">
        {chatSessions.slice(0, 10).map((s) => (
          <button
            key={s.id}
            type="button"
            className={`w-full rounded-[14px] border px-3 py-2 text-left transition-all ${
              activeChatSessionId === s.id
                ? "border-teal bg-teal/12 shadow-md"
                : "border-white/8 bg-black/10 hover:bg-white/8"
            }`}
            onClick={() => handleSwitchSession(s.id)}
          >
            <p className={`truncate text-xs ${activeChatSessionId === s.id ? "font-semibold text-white" : "text-white/82"}`}>
              {s.title}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">
              {new Date(s.created_at).toLocaleDateString("ko-KR")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

const teacherNavSections: NavSection[] = [
  {
    title: "분석",
    items: [
      { href: "/studio/analysis", label: "질문 분석", icon: "📊" },
      { href: "/studio/semester-report", label: "학기 리포트", icon: "📅", badge: "Mi:dm 128K" },
      { href: "/studio/class-pattern", label: "반 패턴 분석", icon: "🔍", badge: "Mi:dm 128K" },
    ],
  },
  {
    title: "자동 생성",
    items: [
      { href: "/studio/curriculum", label: "커리큘럼·시험", icon: "📋", badge: "A.X K1" },
      { href: "/studio/visual", label: "개념 시각화", icon: "🎨", badge: "VARCO" },
      { href: "/studio/generate", label: "수업 도구", icon: "🧰" },
    ],
  },
  {
    title: "입력",
    items: [
      { href: "/studio/upload", label: "프린트물 업로드", icon: "📄", badge: "Upstage" },
    ],
  },
  {
    title: "운영",
    items: [
      { href: "/studio/classes", label: "반 관리", icon: "🏫" },
      { href: "/studio/mypage", label: "마이페이지", icon: "👤" },
    ],
  },
];

function AddBotModal({ onClose, onAdd }: { onClose: () => void; onAdd: (bot: TextbookBot) => void }) {
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [publisher, setPublisher] = useState("");
  const [bookName, setBookName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grade.trim() || !subject.trim() || !publisher.trim() || !bookName.trim()) return;
    const id = `custom-${Date.now()}`;
    const bot: TextbookBot = {
      id,
      schoolLevel: grade.includes("중") ? "중등" : "고등",
      grade: grade.trim(),
      subject: subject.trim(),
      publisher: publisher.trim(),
      textbookName: bookName.trim(),
      description: `${grade.trim()} ${subject.trim()} 교과서 챗봇`,
      distributionLabel: "사용자 추가",
      activeStudents: 0,
      starterPrompts: [
        `${subject.trim()}에서 가장 중요한 개념을 설명해줘.`,
        `이 단원에서 자주 틀리는 부분이 뭐야?`,
      ],
      sections: [],
    };
    onAdd(bot);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold text-navy">교과서 봇 추가</h2>
        <p className="mt-1 text-sm text-muted">교과서 정보를 입력하면 AI 챗봇이 생성됩니다.</p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">학년</span>
            <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 고1, 중2" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">과목</span>
            <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 수학, 과학, 국어" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">출판사</span>
            <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 비상교육, 미래엔" value={publisher} onChange={(e) => setPublisher(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">교과서명</span>
            <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 수학 I, 과학 2" value={bookName} onChange={(e) => setBookName(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-gray-50">
            취소
          </button>
          <button type="submit" className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal">
            추가
          </button>
        </div>
      </form>
    </div>
  );
}

function StudentSubjectSelector({ currentBot, onBotChange }: { currentBot: TextbookBot; onBotChange: (bot: TextbookBot) => void }) {
  const studentSubjects = ["수학", "국어", "영어", "과학", "사회", "한국사", "물리학", "화학", "생명과학", "정보"];
  const [selected, setSelected] = useState<string | null>(currentBot.subject || null);

  function handleSelect(subj: string) {
    setSelected(subj);
    const dynBot: TextbookBot = {
      id: `student-${subj}`,
      schoolLevel: "",
      grade: "",
      subject: subj,
      publisher: "",
      textbookName: subj,
      description: `${subj} AI 학습 챗봇`,
      distributionLabel: "",
      activeStudents: 0,
      starterPrompts: [
        `${subj}에서 이해가 안 되는 부분을 물어보세요.`,
        `${subj} 개념을 쉽게 설명해줘.`,
      ],
      sections: [],
    };
    onBotChange(dynBot);
  }

  return (
    <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
      <p className="text-sm font-semibold">과목 선택</p>
      <p className="mt-1 text-xs text-white/50">질문할 과목을 선택하세요</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {studentSubjects.map((subj) => (
          <button
            key={subj}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              selected === subj
                ? "bg-teal text-white shadow-lg"
                : "border border-white/10 bg-white/6 text-white/72 hover:bg-white/12"
            }`}
            onClick={() => handleSelect(subj)}
          >
            {subj}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextbookSelector({ subject, currentBot, onSelect }: { subject: string; currentBot: TextbookBot; onSelect: (t: CatalogTextbook) => void }) {
  const pubs = getPublishersForSubject(subject);
  const [selectedPub, setSelectedPub] = useState<string | null>(null);
  const books = selectedPub ? getSubjectTextbooks(subject).filter((t) => t.publisher === selectedPub) : [];

  return (
    <div className="mt-3 space-y-2">
      {/* Publisher select */}
      <div>
        <p className="mb-2 text-xs text-white/58">출판사</p>
        <div className="flex flex-wrap gap-1.5">
          {pubs.map((pub) => (
            <button
              key={pub}
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                selectedPub === pub
                  ? "bg-teal text-white"
                  : "border border-white/10 bg-white/6 text-white/72 hover:bg-white/12"
              }`}
              onClick={() => setSelectedPub(selectedPub === pub ? null : pub)}
            >
              {pub}
            </button>
          ))}
        </div>
      </div>
      {/* Books for selected publisher */}
      {selectedPub && books.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-white/58">교과서</p>
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              className={`w-full rounded-[16px] border px-3 py-2.5 text-left transition-all ${
                currentBot.id === book.id
                  ? "border-transparent bg-white text-navy shadow-lg"
                  : "border-white/10 bg-white/6 text-white hover:bg-white/10"
              }`}
              onClick={() => onSelect(book)}
            >
              <p className={`text-xs font-semibold ${currentBot.id === book.id ? "text-muted" : "text-white/58"}`}>
                {book.grade} · {book.author}
              </p>
              <p className="mt-0.5 text-sm font-semibold">{book.textbookName}</p>
            </button>
          ))}
        </div>
      )}
      {!selectedPub && (
        <p className="rounded-[14px] border border-white/8 bg-black/10 px-3 py-2.5 text-xs text-white/50">
          출판사를 선택하세요
        </p>
      )}
    </div>
  );
}

function TeacherClassList() {
  const { switchBotForClass } = useStudio();
  const [teacherClasses, setTeacherClasses] = useState<Array<{ id: string; name: string; subject: string; grade: string; publisher: string; textbookName: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    fetch("/api/classes").then((r) => r.json()).then((d) => {
      const cls = d.classes?.map((c: any) => ({
        id: c.id, name: c.name, subject: c.subject ?? "",
        grade: c.grade ?? "", publisher: c.publisher ?? "", textbookName: c.textbook_name ?? "",
      })) ?? [];
      setTeacherClasses(cls);
      if (cls.length > 0) {
        setSelectedId(cls[0].id);
        switchBotForClass(cls[0]);
      }
    }).catch(() => {});
  }, [switchBotForClass]);

  function handleSelect(cls: typeof teacherClasses[0]) {
    setSelectedId(cls.id);
    switchBotForClass(cls);
  }

  if (teacherClasses.length === 0) {
    return (
      <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
        <p className="text-sm font-semibold">내 반</p>
        <p className="mt-2 text-xs text-white/50">반 관리 페이지에서 반을 만들어 주세요.</p>
        <Link href="/studio/classes" className="mt-2 inline-block text-xs font-semibold text-teal hover:underline">
          반 만들러 가기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">내 반</p>
        <Link href="/studio/classes" className="text-xs text-white/50 hover:text-teal">관리 →</Link>
      </div>
      <div className="mt-3 space-y-1.5">
        {teacherClasses.map((cls) => (
          <button
            key={cls.id}
            type="button"
            className={`w-full rounded-[14px] border px-3 py-2.5 text-left transition-all ${
              selectedId === cls.id
                ? "border-teal bg-teal/12 shadow-md"
                : "border-white/8 bg-black/10 hover:bg-white/8"
            }`}
            onClick={() => handleSelect(cls)}
          >
            <p className={`text-sm font-semibold ${selectedId === cls.id ? "text-white" : "text-white/82"}`}>{cls.name}</p>
            <p className="mt-0.5 text-xs text-white/50">{cls.grade} {cls.subject} · {cls.publisher}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StudioSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { allBots, currentBot, handleBotChange, addCustomBot, currentQuestionVolume, topClusters, setChatInput, currentStudentWeaknesses } = useStudio();
  const [showAddBot, setShowAddBot] = useState(false);
  const [dashStats, setDashStats] = useState<{ totalQuestions: number; totalStudents: number } | null>(null);

  useEffect(() => {
    if (user?.role !== "teacher") return;
    fetch("/api/dashboard").then((r) => r.json()).then((d) => {
      if (!d.error) setDashStats({ totalQuestions: d.totalQuestions, totalStudents: d.totalStudents });
    }).catch(() => {});
  }, [user?.role]);

  const role = user?.role ?? null;
  const navSections =
    role === "student" ? studentNavSections : role === "teacher" ? teacherNavSections : [];

  function handleLogout() {
    logout().finally(() => {
      window.location.href = "/studio/login";
    });
  }

  return (
    <>
    {showAddBot && <AddBotModal onClose={() => setShowAddBot(false)} onAdd={addCustomBot} />}
    <aside className="app-sidebar-panel rounded-[28px] p-4 text-white lg:sticky lg:top-3 lg:h-[calc(100vh-24px)] lg:overflow-y-auto lg:p-5 app-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-xs text-white/64">ProofLoop Studio</p>
          <h1 className="mt-2 text-xl font-semibold">교과서 AI 워크스페이스</h1>
          {user && (
            <p className="mt-2 text-sm leading-6 text-white/72">
              {user.name}님 ({user.role === "student" ? "학생" : "교사"})
            </p>
          )}
        </div>
        {user && (
          <button
            className="whitespace-nowrap rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-medium text-white/88 transition-colors hover:bg-white/14"
            onClick={handleLogout}
            type="button"
          >
            로그아웃
          </button>
        )}
      </div>

      {role && (
        <>
          {/* Navigation — grouped by section */}
          <nav className="mt-5 space-y-4">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/48">
                  {section.title}
                </p>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`group flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all ${
                            active
                              ? "bg-teal text-white shadow-lg shadow-teal/20"
                              : "text-white/76 hover:bg-white/8 hover:text-white"
                          }`}
                        >
                          <span className="text-base leading-none">{item.icon}</span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                active
                                  ? "bg-white/20 text-white"
                                  : "bg-orange/20 text-orange/90 group-hover:bg-orange/30"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* ===== TEACHER SIDEBAR ===== */}
          {role === "teacher" && (
            <>
              {/* Class list — primary navigation for teachers */}
              <TeacherClassList />

              {/* Status */}
              {currentBot.publisher && (
                <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs font-semibold tracking-[0.1em] text-white/58">현재 운영 상태</p>
                  <div className="mt-3 grid gap-3">
                    <SidebarMetric label="교과서" value={`${currentBot.publisher} · ${currentBot.textbookName}`} />
                    <SidebarMetric label="누적 질문" value={`${dashStats?.totalQuestions ?? 0}건`} />
                    <SidebarMetric label="참여 학생" value={`${dashStats?.totalStudents ?? 0}명`} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== STUDENT SIDEBAR ===== */}
          {role === "student" && (
            <>
              {/* Join classes — top priority, always visible */}
              <JoinClassWidget />
              {/* Chat session history */}
              <StudentSessionList />
            </>
          )}
        </>
      )}
    </aside>
    </>
  );
}

/** Pages that don't need the sidebar (login, role select) */
const noSidebarPaths = ["/studio/login", "/studio"];

function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !noSidebarPaths.includes(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!showSidebar) {
    return (
      <main className="studio-app px-3 py-3 sm:px-4 lg:px-5">
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    );
  }

  return (
    <main className="studio-app px-3 py-3 sm:px-4 lg:px-5">
      {/* Mobile hamburger button */}
      <button
        type="button"
        className="mb-3 flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <span className="text-lg">{mobileOpen ? "✕" : "☰"}</span>
        {mobileOpen ? "메뉴 닫기" : "메뉴"}
      </button>

      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Sidebar: hidden on mobile unless toggled */}
        <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
          <StudioSidebar />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StudioProvider>
        <StudioShell>{children}</StudioShell>
      </StudioProvider>
    </AuthProvider>
  );
}
