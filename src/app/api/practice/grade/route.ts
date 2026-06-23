import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai";
import type { GradeResult, PracticeItem } from "@/lib/practice";

export const maxDuration = 60;

interface AnswerInput {
  index: number;
  answer: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const setId = (body?.setId as string | undefined)?.trim();
  const answers: AnswerInput[] = Array.isArray(body?.answers) ? body.answers : [];
  if (!setId || answers.length === 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 본인 세트만 (RLS도 막지만 명시 확인)
  const { data: set } = await supabase
    .from("practice_sets")
    .select("id, class_id, concept, items, student_id")
    .eq("id", setId)
    .maybeSingle();
  if (!set || set.student_id !== user.id) {
    return NextResponse.json({ error: "연습문제를 찾을 수 없습니다." }, { status: 404 });
  }

  const items = (set.items ?? []) as PracticeItem[];
  const toGrade = answers
    .filter((a) => a && typeof a.index === "number" && items[a.index])
    .map((a) => ({ index: a.index, item: items[a.index], studentAnswer: String(a.answer ?? "").trim() }));

  if (toGrade.length === 0) {
    return NextResponse.json({ error: "채점할 답안이 없습니다." }, { status: 400 });
  }

  const provider = getProvider("reasoning");
  if (!provider) return NextResponse.json({ error: "채점 AI 모델이 설정되지 않았습니다." }, { status: 500 });

  const gradeBlock = toGrade
    .map(
      (g) =>
        `[${g.index}]\n문제: ${g.item.question}\n정답: ${g.item.answer}\n학생답: ${g.studentAnswer || "(미응답)"}`,
    )
    .join("\n\n");

  const system = `당신은 수학 채점 교사입니다. 학생 답이 정답과 수학적으로 같은지 판단하고(표현이 달라도 값이 같으면 정답), 짧은 피드백을 답니다.
- 맞으면 칭찬 + 핵심 한 줄, 틀리면 어디서 틀렸는지 + 힌트(정답을 그대로 다 알려주진 마세요).
- 수학 기호는 LaTeX/$ 없이 일반 텍스트로. 마크다운 금지.

## 출력 형식 (JSON만)
{"results":[{"index":0,"is_correct":true,"feedback":"..."}]}`;
  const userPrompt = `다음 답안들을 채점해 주세요.\n\n${gradeBlock}`;

  let parsed: { results?: Array<{ index: number; is_correct: boolean; feedback: string }> };
  try {
    parsed = await provider.chatJson({ systemPrompt: system, userPrompt, temperature: 0.2, timeoutMs: 50000 });
  } catch (e) {
    console.error("[practice/grade] AI error:", e);
    return NextResponse.json({ error: "채점에 실패했습니다. 다시 시도해 주세요." }, { status: 502 });
  }

  const byIndex = new Map<number, { is_correct: boolean; feedback: string }>();
  for (const r of parsed.results ?? []) {
    if (typeof r.index === "number") byIndex.set(r.index, { is_correct: !!r.is_correct, feedback: String(r.feedback ?? "") });
  }

  const results: GradeResult[] = toGrade.map((g) => {
    const r = byIndex.get(g.index) ?? { is_correct: false, feedback: "채점 결과를 확인하지 못했어요." };
    return { index: g.index, isCorrect: r.is_correct, feedback: r.feedback, answer: g.item.answer, solution: g.item.solution };
  });

  // 풀이 기록 저장 (숙달 루프 / 교사 분석)
  const attemptRows = toGrade.map((g) => {
    const r = results.find((x) => x.index === g.index)!;
    return {
      set_id: setId,
      class_id: set.class_id,
      student_id: user.id,
      item_index: g.index,
      concept: set.concept ?? null,
      student_answer: g.studentAnswer || null,
      is_correct: r.isCorrect,
      feedback: r.feedback || null,
    };
  });
  try {
    await supabase.from("practice_attempts").insert(attemptRows);
  } catch (e) {
    console.error("[practice/grade] save attempts failed:", e);
  }

  const correct = results.filter((r) => r.isCorrect).length;
  return NextResponse.json({ results, summary: { correct, total: results.length } });
}
