import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError, getChatProvider } from "@/lib/ai";

interface ChatRequestBody {
  question: string;
  botId: string;
  classId?: string;
  sessionId?: string;
  /** Textbook sections for grounding */
  sections: Array<{
    title: string;
    pages: string;
    summary: string;
    explanation: string;
    keywords: string[];
    misconceptionTags: string[];
    citationFocus: string;
  }>;
  /** Recent chat history for context */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  botMeta: {
    grade: string;
    subject: string;
    publisher: string;
    textbookName: string;
  };
}

function buildSystemPrompt(body: ChatRequestBody): string {
  const { botMeta, sections } = body;

  const sectionBlock = sections
    .map(
      (s) =>
        `### ${s.title} (${s.pages})\n` +
        `요약: ${s.summary}\n` +
        `설명: ${s.explanation}\n` +
        `핵심어: ${s.keywords.join(", ")}\n` +
        `자주 하는 오개념: ${s.misconceptionTags.join("; ")}\n` +
        `인용 기준: ${s.citationFocus}`
    )
    .join("\n\n");

  return `당신은 ${botMeta.grade} ${botMeta.subject} 교과서 학습 챗봇이자 학습 코치입니다.
교과서: ${botMeta.publisher} ${botMeta.textbookName}

## 핵심 규칙
1. 반드시 아래 교과서 범위 안에서만 답하세요. 범위를 벗어나는 질문에는 "이 교과서 범위에서는 다루지 않는 내용입니다"라고 답하세요.
2. 답변에는 반드시 관련 단원명과 쪽수를 근거로 포함하세요. 예: "(이차함수의 그래프와 축, 42-47쪽)"
3. 학생이 가질 수 있는 오개념을 미리 짚어주고 올바른 이해로 안내하세요.
4. 한국어로 답하세요. 친절하지만 간결하게, 교과서 근거에 충실하게 답하세요.
5. 수학 기호는 LaTeX나 $기호 없이 일반 텍스트로 쓰세요. 예: "y = a(x-p)^2 + q", "cos θ = x/r", "루트 3". 절대로 $, \frac, \cos, \theta 같은 LaTeX 문법을 사용하지 마세요.
6. 마크다운 문법(**굵게**, *기울임*, # 제목 등)을 절대 사용하지 마세요. 일반 텍스트로만 답하세요. 강조가 필요하면 따옴표("")나 괄호()를 사용하세요.

## 과제 대행 감지 & 학습 유도
- 학생이 "이 문제 풀어줘", "과제 해줘", "답 알려줘" 등 **답을 직접 요구**하면 바로 답을 주지 마세요.
- 대신 "스스로 풀 수 있도록 도와줄게요"라고 하고, 핵심 개념을 설명한 뒤 **서술형 확인 질문**을 1개 내세요.
- 서술형 질문은 찍어서 맞출 수 없는 형태여야 합니다. 예: "~를 자신의 말로 설명해 보세요", "~가 왜 그런지 이유를 써 보세요".
- 학생이 서술형 질문에 답하면 그 답변을 분석해 이해 수준을 평가하세요.

## 이해도 평가
매 답변에서 학생의 이해 수준을 아래 5단계로 판단하세요:
- 1단계(매우 부족): 개념을 전혀 모르거나 완전히 틀린 이해
- 2단계(부족): 개념의 일부만 알고 핵심을 놓침
- 3단계(보통): 기본 개념은 알지만 응용이나 연결이 약함
- 4단계(양호): 개념을 정확히 이해하고 간단한 응용 가능
- 5단계(우수): 개념을 자기 말로 설명하고 다른 개념과 연결 가능

## 교과서 단원 데이터

${sectionBlock}

## 답변 형식
답변 본문을 먼저 쓰고, 맨 마지막에 다음 태그들을 각각 한 줄에 적어주세요:
[근거] 단원명 / 쪽수
[이해도] 1~5 (숫자만)
[후속 질문] 이어서 생각해볼 서술형 질문`;
}

// GET: load chat history for a class, optionally filtered by sessionId
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ messages: [] });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  const sessionId = searchParams.get("sessionId");
  if (!classId) return NextResponse.json({ messages: [] });

  let query = supabase
    .from("chat_messages")
    .select("id, role, message_text, evidence, follow_up, understanding, session_id, created_at")
    .eq("class_id", classId)
    .eq("student_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data } = await query;

  const messages = (data ?? []).map((m: any) => ({
    id: m.id,
    role: m.role,
    text: m.message_text,
    evidence: m.evidence || undefined,
    followUp: m.follow_up || undefined,
    understanding: m.understanding || undefined,
    sessionId: m.session_id || undefined,
  }));

  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const provider = getChatProvider();

  if (!provider) {
    return NextResponse.json(
      { error: "AI 채팅 모델이 설정되지 않았습니다. AI_PROVIDER 환경변수를 확인하세요." },
      { status: 500 }
    );
  }

  const body: ChatRequestBody = await request.json().catch(() => null);
  if (!body?.question || !body?.sections) {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    );
  }

  const systemPrompt = buildSystemPrompt(body);

  const recentHistory = body.history.slice(-10);
  const messages = [
    ...recentHistory.map((m) => ({ role: m.role, text: m.text })),
    { role: "user" as const, text: body.question },
  ];

  let text: string;

  try {
    text = await provider.chat({
      systemPrompt,
      messages,
      temperature: 0.7,
      maxTokens: 1024,
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error(`[chat] ${err.provider} error:`, err.status, err.message);
    } else {
      console.error("[chat] fetch failed:", err);
    }
    return NextResponse.json(
      { error: "AI 서버에 연결할 수 없습니다." },
      { status: 502 }
    );
  }

  const lines = text.split("\n");
  let mainAnswer = "";
  let evidenceStr = "";
  let followUp = "";
  let understanding = 0;

  for (const line of lines) {
    if (line.startsWith("[근거]")) {
      evidenceStr = line.replace("[근거]", "").trim();
    } else if (line.startsWith("[이해도]")) {
      understanding = parseInt(line.replace("[이해도]", "").trim(), 10) || 0;
    } else if (line.startsWith("[후속 질문]")) {
      followUp = line.replace("[후속 질문]", "").trim();
    } else {
      mainAnswer += line + "\n";
    }
  }

  let resolvedSessionId: string | null = body.sessionId || null;
  if (body.classId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const evidenceParts = evidenceStr.split("/").map((s: string) => s.trim());
        const sectionTitle = evidenceParts[0] || null;

        let misconception: string | null = null;
        if (sectionTitle) {
          const matchedSection = body.sections.find((s) =>
            sectionTitle.includes(s.title) || s.title.includes(sectionTitle)
          );
          if (matchedSection) {
            misconception = matchedSection.misconceptionTags[0] ?? null;
          }
        }

        await supabase.from("student_questions").insert({
          class_id: body.classId,
          student_id: user.id,
          question: body.question,
          section_title: sectionTitle,
          misconception,
          understanding_level: understanding || null,
        });

        if (!resolvedSessionId) {
          const { data: newSession } = await supabase
            .from("chat_sessions")
            .insert({
              class_id: body.classId,
              student_id: user.id,
              title: body.question.slice(0, 30) + (body.question.length > 30 ? "..." : ""),
            })
            .select("id")
            .single();
          resolvedSessionId = newSession?.id ?? null;
        }

        await supabase.from("chat_messages").insert([
          { class_id: body.classId, student_id: user.id, role: "user", message_text: body.question, session_id: resolvedSessionId },
          { class_id: body.classId, student_id: user.id, role: "assistant", message_text: mainAnswer.trim(), evidence: evidenceStr || null, follow_up: followUp || null, understanding: understanding || null, session_id: resolvedSessionId },
        ]);
      }
    } catch (e) {
      console.error("[chat] failed to save question:", e);
    }
  }

  return NextResponse.json({
    answer: mainAnswer.trim(),
    evidence: evidenceStr,
    followUp: followUp,
    understanding: understanding || null,
    sessionId: resolvedSessionId,
  });
}
