import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSemesterReport, heuristicSemesterReport, type SemesterReportInput } from "@/lib/semester-report";

export const dynamic = "force-dynamic";

interface QRow {
  question: string;
  section_title: string | null;
  misconception: string | null;
  understanding_level: number | null;
  created_at: string;
}

function classLabelOf(c: { grade?: string | null; subject?: string | null; publisher?: string | null; name?: string | null } | undefined): string {
  if (!c) return "반";
  const label = `${c.grade ?? ""} ${c.subject ?? ""}${c.publisher ? ` (${c.publisher})` : ""}`.trim();
  return label || c.name || "반";
}

/** 실제 학생 질문 기록 → 학기 리포트 입력으로 변환 */
function buildInput(studentName: string, classLabel: string, period: string, rows: QRow[]): SemesterReportInput {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = sorted.length ? new Date(sorted[0].created_at).getTime() : Date.now();
  const weekOf = (iso: string) => {
    const wk = Math.floor((new Date(iso).getTime() - first) / (7 * 86_400_000)) + 1;
    return `W${String(Math.max(1, wk)).padStart(2, "0")}`;
  };

  const chatLog: SemesterReportInput["chatLog"] = [];
  const misconceptionTags: string[] = [];
  const sectionAgg = new Map<string, { sum: number; cnt: number; q: number }>();

  for (const r of sorted) {
    const w = weekOf(r.created_at);
    const unit = r.section_title ?? undefined;
    chatLog.push({ week: w, role: "student", text: r.question, unit });
    if (typeof r.understanding_level === "number") {
      chatLog.push({ week: w, role: "assistant", text: "", unit, understanding: r.understanding_level });
    }
    if (r.misconception) misconceptionTags.push(r.misconception);
    if (r.section_title) {
      const e = sectionAgg.get(r.section_title) ?? { sum: 0, cnt: 0, q: 0 };
      e.q += 1;
      if (typeof r.understanding_level === "number") { e.sum += r.understanding_level; e.cnt += 1; }
      sectionAgg.set(r.section_title, e);
    }
  }

  const weakSections = Array.from(sectionAgg.entries()).map(([unit, e]) => ({
    unit,
    avgUnderstanding: e.cnt > 0 ? Math.round((e.sum / e.cnt) * 10) / 10 : 3,
    questionCount: e.q,
  }));

  return { studentName, classLabel, period, chatLog, misconceptionTags, weakSections };
}

// GET: 교사 반의 실제 학생 목록
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ students: [] });

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, subject, grade, publisher")
    .eq("teacher_id", user.id);
  if (!classes?.length) return NextResponse.json({ students: [] });

  const classIds = classes.map((c) => c.id);
  const classById = new Map(classes.map((c) => [c.id, c]));

  const { data: members } = await supabase
    .from("class_members")
    .select("student_id, class_id, profiles:student_id(name)")
    .in("class_id", classIds);

  const seen = new Set<string>();
  const students: Array<{ id: string; name: string; classLabel: string }> = [];
  for (const m of (members ?? []) as Array<{ student_id: string; class_id: string; profiles: { name?: string } | null }>) {
    if (seen.has(m.student_id)) continue;
    seen.add(m.student_id);
    students.push({
      id: m.student_id,
      name: m.profiles?.name ?? "이름 없음",
      classLabel: classLabelOf(classById.get(m.class_id)),
    });
  }
  return NextResponse.json({ students });
}

// POST: 특정 학생의 실제 질문 로그로 학기 리포트 생성
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.studentId !== "string") {
    return NextResponse.json({ error: "studentId가 필요합니다." }, { status: 400 });
  }
  const period = typeof body.period === "string" && body.period ? body.period : "2026년 1학기 (3월~6월)";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, subject, grade, publisher")
    .eq("teacher_id", user.id);
  if (!classes?.length) return NextResponse.json({ error: "반이 없습니다." }, { status: 404 });
  const classIds = classes.map((c) => c.id);

  // 학생이 이 교사 반 소속인지 확인 + 이름
  const { data: mem } = await supabase
    .from("class_members")
    .select("class_id, profiles:student_id(name)")
    .eq("student_id", body.studentId)
    .in("class_id", classIds)
    .limit(1)
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: "이 학생을 찾을 수 없습니다." }, { status: 404 });

  const memRow = mem as { class_id: string; profiles: { name?: string } | null };
  const studentName = memRow.profiles?.name ?? "학생";
  const classLabel = classLabelOf(classes.find((c) => c.id === memRow.class_id));

  const { data: questions } = await supabase
    .from("student_questions")
    .select("question, section_title, misconception, understanding_level, created_at")
    .eq("student_id", body.studentId)
    .in("class_id", classIds)
    .order("created_at", { ascending: true });

  const input = buildInput(studentName, classLabel, period, (questions ?? []) as QRow[]);

  // 질문이 없으면 LLM 호출 없이 휴리스틱(빈 리포트)
  if (input.chatLog.length === 0) {
    return NextResponse.json(heuristicSemesterReport(input));
  }
  const report = await generateSemesterReport(input);
  return NextResponse.json(report);
}
