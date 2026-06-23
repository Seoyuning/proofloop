import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai";
import { normalizeGradeKey, stripAnswers, type PracticeItem } from "@/lib/practice";

export const maxDuration = 60;

interface BankRow {
  question_text: string;
  answer_text: string | null;
  solution_text: string | null;
  problem_type: string | null;
  difficulty: string | null;
  standard_text: string | null;
}

function buildPrompt(grade: string, concept: string, examples: BankRow[], count: number) {
  const exBlock = examples
    .map((e, i) =>
      `예시 ${i + 1} (${e.problem_type ?? "주관식"} · 난이도 ${e.difficulty ?? "중"})\n` +
      `문항: ${e.question_text}\n` +
      (e.answer_text ? `정답: ${e.answer_text}\n` : "") +
      (e.solution_text ? `풀이: ${e.solution_text}\n` : "") +
      (e.standard_text ? `성취기준: ${e.standard_text}` : ""),
    )
    .join("\n\n");

  const system = `당신은 ${grade} 수학 문제 출제 전문가입니다. 아래 예시 문제들의 학년 수준·형식·난이도를 참고해, 같은 개념의 새 연습문제를 만듭니다.

## 규칙
1. "${concept}" 개념에 대한 새 문제 ${count}개를 만드세요. 예시를 그대로 베끼지 말고 숫자/상황을 바꾼 새 문제로.
2. 학년 수준(${grade})에 맞는 난이도를 유지하세요.
3. 수학 기호는 LaTeX나 $기호 없이 일반 텍스트로 쓰세요. 예: "3/4", "x^2", "루트 2". 절대 $, \\frac 같은 LaTeX를 쓰지 마세요.
4. 마크다운(**굵게** 등)을 쓰지 마세요.
5. 객관식이면 choices에 보기 4개를 넣고 answer는 보기 중 하나로. 주관식이면 choices는 비웁니다.
6. 각 문제에 정답(answer)과 단계별 풀이(solution)를 반드시 포함하세요.

## 출력 형식 (JSON만)
{"items":[{"type":"주관식 또는 객관식","question":"문제","choices":["보기1","보기2","보기3","보기4"],"answer":"정답","solution":"풀이 과정"}]}`;

  const user = `[참고 예시]\n${exBlock}\n\n위 형식·수준으로 "${concept}" 개념의 새 연습문제 ${count}개를 JSON으로 만들어 주세요.`;
  return { system, user };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const classId = (body?.classId as string | undefined)?.trim();
  let concept = (body?.concept as string | undefined)?.trim() || "";
  const sessionId = (body?.sessionId as string | undefined) || null;
  const count = Math.min(Math.max(parseInt(body?.count, 10) || 3, 1), 5);
  if (!classId) return NextResponse.json({ error: "classId가 필요합니다." }, { status: 400 });

  // 반 멤버십 + 학년 확인
  const { data: cls } = await supabase.from("classes").select("id, grade, subject").eq("id", classId).maybeSingle();
  if (!cls) return NextResponse.json({ error: "반을 찾을 수 없습니다." }, { status: 404 });
  const { data: membership } = await supabase
    .from("class_members").select("class_id").eq("class_id", classId).eq("student_id", user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "이 반의 학생만 사용할 수 있습니다." }, { status: 403 });

  const gradeKey = normalizeGradeKey(cls.grade || "");

  // 약점 개념 미지정 시 최근 질문에서 추론
  if (!concept) {
    const { data: recent } = await supabase
      .from("student_questions").select("section_title").eq("class_id", classId).eq("student_id", user.id)
      .not("section_title", "is", null).order("created_at", { ascending: false }).limit(1);
    concept = recent?.[0]?.section_title || cls.subject || "수학";
  }

  // few-shot 예시: 학년 + 개념 매칭 → 부족하면 학년만
  const cols = "question_text, answer_text, solution_text, problem_type, difficulty, standard_text";
  const term = concept.replace(/[,%*()]/g, " ").trim().slice(0, 30);
  let examples: BankRow[] = [];
  if (term) {
    const { data } = await supabase
      .from("problem_bank").select(cols).eq("grade_key", gradeKey)
      .or(`standard_text.ilike.%${term}%,question_text.ilike.%${term}%`).limit(3);
    examples = (data as BankRow[]) ?? [];
  }
  if (examples.length < 2) {
    const { data } = await supabase.from("problem_bank").select(cols).eq("grade_key", gradeKey).limit(3);
    const extra = (data as BankRow[]) ?? [];
    const seen = new Set(examples.map((e) => e.question_text));
    for (const e of extra) if (!seen.has(e.question_text) && examples.length < 3) examples.push(e);
  }

  if (examples.length === 0) {
    return NextResponse.json(
      { error: `아직 ${cls.grade || "이 학년"} 수학 문제 데이터가 없어 연습문제를 만들 수 없어요.`, empty: true },
      { status: 200 },
    );
  }

  const provider = getProvider("reasoning");
  if (!provider) return NextResponse.json({ error: "출제 AI 모델이 설정되지 않았습니다." }, { status: 500 });

  const { system, user: userPrompt } = buildPrompt(cls.grade || gradeKey, concept, examples, count);

  let parsed: { items?: PracticeItem[] };
  try {
    parsed = await provider.chatJson({ systemPrompt: system, userPrompt, temperature: 0.6, timeoutMs: 50000 });
  } catch (e) {
    console.error("[practice/generate] AI error:", e);
    return NextResponse.json({ error: "문제 생성에 실패했습니다. 다시 시도해 주세요." }, { status: 502 });
  }

  const items: PracticeItem[] = (parsed.items ?? [])
    .filter((it) => it && it.question && it.answer)
    .slice(0, count)
    .map((it) => ({
      type: it.type === "객관식" ? "객관식" : "주관식",
      question: String(it.question),
      choices: Array.isArray(it.choices) ? it.choices.map(String).filter(Boolean) : undefined,
      answer: String(it.answer),
      solution: String(it.solution ?? ""),
    }));

  if (items.length === 0) {
    return NextResponse.json({ error: "문제 생성 결과가 비어 있습니다. 다시 시도해 주세요." }, { status: 502 });
  }

  // 저장
  const { data: set, error: insErr } = await supabase
    .from("practice_sets")
    .insert({ class_id: classId, student_id: user.id, session_id: sessionId, concept, grade_key: gradeKey, source: "auto", items })
    .select("id")
    .single();
  if (insErr || !set) {
    console.error("[practice/generate] insert failed:", insErr);
    return NextResponse.json({ error: "연습문제 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ setId: set.id, concept, questions: stripAnswers(items) });
}
