import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError, getProvider, friendlyModelName } from "@/lib/ai";
import { routeStudentMessage } from "@/lib/ai/orchestrator";
import { embedQuery, isEmbeddingConfigured, toVectorLiteral } from "@/lib/ai/embeddings";

// 검색된 학습자료 청크 (RAG)
interface RetrievedChunk {
  id: string;
  material_id: string;
  title: string;
  content: string;
  page: number | null;
  similarity: number;
}

const RETRIEVE_COUNT = 6; // 프롬프트에 넣을 청크 수
const DISPLAY_MIN_SIM = 0.3; // 근거 카드로 보여줄 최소 유사도

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

// 업로드 학습자료(RAG)로 grounding 하는 시스템 프롬프트
function buildMaterialSystemPrompt(botMeta: ChatRequestBody["botMeta"], chunks: RetrievedChunk[]): string {
  const materialBlock = chunks
    .map((c) => `[자료: ${c.title}${c.page ? ` ${c.page}쪽` : ""}]\n${c.content}`)
    .join("\n\n---\n\n");

  const subjectLine = botMeta.subject ? `과목: ${botMeta.subject}` : "";

  return `당신은 ${botMeta.grade} ${botMeta.subject} 학습 챗봇이자 학습 코치입니다.
${subjectLine}

## 핵심 규칙
1. 반드시 아래 [학습자료]에 적힌 내용에만 근거해 답하세요. 자료에 없는 내용은 절대 지어내지 말고 "올려주신 학습자료에서는 그 내용을 찾을 수 없어요. 선생님께 자료 보완을 요청해 보세요."라고 답하세요.
2. 답변 근거가 된 자료의 제목과 쪽수를 함께 밝히세요.
3. 학생이 가질 수 있는 오개념을 미리 짚어주고 올바른 이해로 안내하세요.
4. 한국어로 답하세요. 친절하지만 간결하게, 자료 근거에 충실하게 답하세요.
5. 수학 기호는 LaTeX나 $기호 없이 일반 텍스트로 쓰세요. 예: "y = a(x-p)^2 + q", "루트 3". 절대로 $, \\frac, \\cos, \\theta 같은 LaTeX 문법을 사용하지 마세요.
6. 마크다운 문법(**굵게**, *기울임*, # 제목 등)을 절대 사용하지 마세요. 일반 텍스트로만 답하세요.

## 과제 대행 감지 & 학습 유도
- 학생이 답을 직접 요구하면 바로 답을 주지 말고, 핵심 개념을 설명한 뒤 서술형 확인 질문을 1개 내세요.
- 서술형 질문은 찍어서 맞출 수 없는 형태여야 합니다.

## 이해도 평가
매 답변에서 학생의 이해 수준을 1~5단계로 판단하세요. (1 매우 부족 ~ 5 우수)

## 학습자료 (질문과 관련해 검색된 부분)

${materialBlock}

## 답변 형식
답변 본문을 먼저 쓰고, 맨 마지막에 다음 태그들을 각각 한 줄에 적어주세요:
[근거] 자료명 / 쪽수
[이해도] 1~5 (숫자만)
[후속 질문] 이어서 생각해볼 서술형 질문`;
}

// 질문을 임베딩해 반 학습자료에서 관련 청크를 검색 (없거나 실패하면 빈 배열)
async function retrieveChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  classId: string,
  question: string,
): Promise<RetrievedChunk[]> {
  if (!isEmbeddingConfigured()) return [];
  try {
    const qvec = await embedQuery(question);
    const { data, error } = await supabase.rpc("match_material_chunks", {
      p_class_id: classId,
      query_embedding: toVectorLiteral(qvec),
      match_count: RETRIEVE_COUNT,
    });
    if (error) {
      console.error("[chat] match_material_chunks error:", error.message);
      return [];
    }
    return (data ?? []) as RetrievedChunk[];
  } catch (e) {
    console.error("[chat] retrieval failed:", e);
    return [];
  }
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

  const body: ChatRequestBody = await request.json().catch(() => null);
  if (!body?.question || !body?.sections) {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    );
  }

  // 오케스트레이터: 질문을 분석해 적절한 모델로 라우팅 (A.X K1, 없으면 규칙기반)
  const decision = await routeStudentMessage(body.question);
  const provider = getProvider(decision.useCase);

  if (!provider) {
    return NextResponse.json(
      { error: "AI 채팅 모델이 설정되지 않았습니다. AI 키(UPSTAGE/FRIENDLI 등) 환경변수를 확인하세요." },
      { status: 500 }
    );
  }

  // 실제 사용된 모델명(폴백 반영) — 표시용
  const routing = {
    router: decision.router,
    label: decision.label,
    model: friendlyModelName(provider.name),
    reason: decision.reason,
  };

  // RAG: 업로드된 학습자료가 있으면 그걸 근거로, 없으면 시드 교과서 단원으로 grounding
  let retrieved: RetrievedChunk[] = [];
  if (body.classId) {
    retrieved = await retrieveChunks(supabase, body.classId, body.question);
  }
  const useMaterials = retrieved.length > 0;
  const systemPrompt = useMaterials
    ? buildMaterialSystemPrompt(body.botMeta, retrieved)
    : buildSystemPrompt(body);

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

  // 근거 스니펫(실제 검색된 자료 원문) — 학생/교사가 직접 검증 가능
  const sources = useMaterials
    ? retrieved
        .filter((c) => (c.similarity ?? 0) >= DISPLAY_MIN_SIM)
        .slice(0, 3)
        .map((c) => ({
          title: c.title,
          page: c.page,
          snippet: c.content.length > 240 ? `${c.content.slice(0, 240)}…` : c.content,
        }))
    : [];

  return NextResponse.json({
    answer: mainAnswer.trim(),
    evidence: useMaterials ? "" : evidenceStr,
    sources,
    grounding: useMaterials ? "material" : "textbook",
    followUp: followUp,
    understanding: understanding || null,
    sessionId: resolvedSessionId,
    routing,
  });
}
