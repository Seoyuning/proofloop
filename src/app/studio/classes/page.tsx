"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";

interface ClassInfo {
  id: string;
  name: string;
  school: string | null;
  subject: string;
  grade: string;
  publisher: string;
  textbook_name: string;
  invite_code: string;
  max_students: number;
  created_at: string;
  class_members: Array<{ count: number }>;
}

interface ClassMember {
  studentId: string;
  name: string;
  email: string;
  questionCount: number;
  weakConcepts: Array<{
    sectionTitle: string;
    misconception: string;
    count: number;
    lastQuestion: string;
  }>;
}

export default function ClassesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formSchool, setFormSchool] = useState("");
  const [formGrade, setFormGrade] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formPublisher, setFormPublisher] = useState("");
  const [formBookName, setFormBookName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/studio/login"); return; }
    if (user.role !== "teacher") { router.replace("/studio/chat"); return; }
    fetchClasses();
  }, [user, isLoading, router]);

  async function fetchClasses() {
    setLoading(true);
    try {
      const res = await fetch("/api/classes");
      const data = await res.json();
      setClasses(data.classes ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          school: formSchool,
          grade: formGrade,
          subject: formSubject,
          publisher: formPublisher,
          textbookName: formBookName,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowCreate(false);
        setFormName("");
        setFormSchool("");
        setFormGrade("");
        setFormSubject("");
        setFormPublisher("");
        setFormBookName("");
        fetchClasses();
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSelectClass(classId: string) {
    setSelectedClass(classId);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/members`);
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  if (isLoading || !user || user.role !== "teacher") return null;

  const selectedClassInfo = classes.find((c) => c.id === selectedClass);

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">반 관리</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
              내 반 관리
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              반을 만들고 초대 코드를 학생에게 공유하세요. 최대 35명까지 참여할 수 있습니다.
            </p>
          </div>
          <button
            className="whitespace-nowrap rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal"
            onClick={() => setShowCreate(true)}
            type="button"
          >
            + 반 만들기
          </button>
        </div>
      </header>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowCreate(false)}>
          <form
            className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="text-lg font-semibold text-navy">새 반 만들기</h2>
            <p className="mt-1 text-sm text-muted">반 정보와 사용할 교과서를 입력하세요.</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-navy">학교</span>
                <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 한빛고등학교" value={formSchool} onChange={(e) => setFormSchool(e.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-navy">반 이름</span>
                <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 1학년 3반" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-navy">학년</span>
                  <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 고1" value={formGrade} onChange={(e) => setFormGrade(e.target.value)} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-navy">과목</span>
                  <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 수학" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} required />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-navy">출판사</span>
                  <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 비상교육" value={formPublisher} onChange={(e) => setFormPublisher(e.target.value)} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-navy">교과서명</span>
                  <input className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-teal" placeholder="예: 수학 I" value={formBookName} onChange={(e) => setFormBookName(e.target.value)} required />
                </label>
              </div>
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-gray-50">취소</button>
              <button type="submit" disabled={creating} className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-teal disabled:opacity-60">{creating ? "생성 중..." : "반 만들기"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Class list */}
      {loading ? (
        <div className="app-panel rounded-[28px] p-6 text-center">
          <p className="text-sm text-muted">불러오는 중...</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="app-panel rounded-[28px] p-6 text-center">
          <p className="text-sm text-muted">아직 만든 반이 없습니다. 위의 &quot;반 만들기&quot; 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Classes */}
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="내 반" title="반 목록" copy="반을 클릭하면 학생 목록과 약점 데이터를 확인할 수 있습니다." />
            <div className="mt-6 space-y-3">
              {classes.map((cls) => {
                const memberCount = cls.class_members?.[0]?.count ?? 0;
                return (
                  <button
                    key={cls.id}
                    className={`w-full rounded-[22px] border p-4 text-left transition-all ${
                      selectedClass === cls.id
                        ? "border-teal bg-teal/8 shadow-md"
                        : "border-line bg-white/72 hover:border-teal/40"
                    }`}
                    onClick={() => handleSelectClass(cls.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-navy">
                          {cls.school ? `${cls.school} · ` : ""}{cls.name}
                        </p>
                        <p className="mt-1 text-sm text-muted">{cls.grade} {cls.subject} · {cls.publisher} {cls.textbook_name}</p>
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-navy px-3 py-1 text-xs font-medium text-white">
                        {memberCount}/{cls.max_students}명
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted">초대 코드:</span>
                      <button
                        type="button"
                        className="rounded-lg bg-surface-strong px-3 py-1 text-sm font-bold tracking-widest text-navy transition-colors hover:bg-teal/10 active:bg-teal/20"
                        onClick={(e) => { e.stopPropagation(); handleCopyCode(cls.invite_code); }}
                        title="클릭하면 복사됩니다"
                      >
                        {copiedCode === cls.invite_code ? "복사됨!" : cls.invite_code}
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Members detail */}
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            {!selectedClass ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted">왼쪽에서 반을 선택하세요.</p>
              </div>
            ) : membersLoading ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted">불러오는 중...</p>
              </div>
            ) : (
              <>
                <SectionHeader
                  kicker={selectedClassInfo?.name ?? ""}
                  title="학생별 약점 트래킹"
                  copy={`참여 학생 ${members.length}명의 질문 데이터와 약점을 확인합니다.`}
                />
                <div className="app-scroll mt-6 max-h-[600px] space-y-4 overflow-y-auto pr-1">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted">아직 참여한 학생이 없습니다. 초대 코드를 학생에게 공유하세요.</p>
                  ) : (
                    members.map((m) => (
                      <div key={m.studentId} className="rounded-[22px] border border-line bg-white/72 p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
                            {m.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-base font-semibold text-navy">{m.name}</p>
                            <p className="text-sm text-muted">
                              질문 {m.questionCount}건
                              {m.weakConcepts.length > 0 && ` · 약점 ${m.weakConcepts.length}개`}
                            </p>
                          </div>
                        </div>
                        {m.weakConcepts.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {m.weakConcepts.map((wc, i) => (
                              <div key={i} className="rounded-[18px] border border-line bg-surface-strong p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-navy">{wc.sectionTitle}</p>
                                    <p className="mt-1 text-xs text-muted">{wc.misconception}</p>
                                  </div>
                                  <span className="whitespace-nowrap rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">
                                    {wc.count}회
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-muted">최근: &ldquo;{wc.lastQuestion}&rdquo;</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
