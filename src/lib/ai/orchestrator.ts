/**
 * 오케스트레이터 — 학생 입력을 분석해 5사 중 적절한 use-case로 라우팅한다.
 * 1순위: SKT A.X K1이 내용 분석(LLM 분류). 미연결/실패 시 규칙기반 분류로 폴백.
 * 목적이 명확한 교사 기능(채점·리포트·생성)은 라우팅 없이 정책대로 직접 호출한다.
 */
import { getOrchestratorProvider, type UseCase } from "@/lib/ai";

export type RouteCategory = "reasoning" | "general" | "longContext";

export interface RouteDecision {
  category: RouteCategory;
  useCase: UseCase;
  label: string; // 사람용 분류명
  model: string; // 의도한 1차 모델(표시용 힌트)
  reason: string;
  router: "A.X K1" | "규칙기반";
}

const ROUTES: Record<RouteCategory, { useCase: UseCase; label: string; model: string }> = {
  reasoning: { useCase: "reasoning", label: "수식·풀이 분석", model: "LG EXAONE" },
  general: { useCase: "chat", label: "개념 질의응답", model: "Upstage Solar" },
  longContext: { useCase: "long-context", label: "장문 맥락 분석", model: "KT Mi:dm" },
};

/** A.X 미연결/실패 시 사용하는 키워드 기반 분류 */
function ruleClassify(message: string): RouteCategory {
  const m = message.trim();
  if (/[=²³√^×÷∫∑±≤≥πθ]|\d\s*[+\-*/]\s*\d|풀이|증명|계산|구하(시오|세요|기|는)|방정식|함수|미분|적분|왜.*(돼|되|일까|인가)|틀렸/.test(m)) {
    return "reasoning";
  }
  if (m.length > 350 || /이번 학기|지난(주|달)|학기 (전체|내내)|그동안|전체적으로|요약해/.test(m)) {
    return "longContext";
  }
  return "general";
}

export async function routeStudentMessage(message: string): Promise<RouteDecision> {
  const ax = getOrchestratorProvider();
  if (ax) {
    try {
      const raw = await ax.chatJson({
        systemPrompt: "너는 학생 질문을 분석해 어떤 전문 모델로 보낼지 정하는 라우터다. 한국어로 판단하고 JSON만 출력한다.",
        userPrompt:
          `학생 질문: "${message}"\n\n` +
          `분류 기준:\n` +
          `- reasoning: 수식·풀이·증명·계산 등 단계적 추론이 필요한 질문\n` +
          `- general: 개념 설명·정의 등 일반적인 질문\n` +
          `- longContext: 학기 전체/긴 맥락/요약이 필요한 질문\n\n` +
          `{"category":"reasoning|general|longContext","reason":"분류 근거 한 줄(20자 이내)"} 만 출력.`,
        temperature: 0,
        timeoutMs: 8000,
      });
      const o = (raw ?? {}) as { category?: unknown; reason?: unknown };
      if (o.category === "reasoning" || o.category === "general" || o.category === "longContext") {
        const r = ROUTES[o.category];
        return {
          ...r,
          category: o.category,
          reason: typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : "A.X 분석",
          router: "A.X K1",
        };
      }
    } catch {
      // A.X 실패 → 규칙기반 폴백
    }
  }

  const category = ruleClassify(message);
  return { ...ROUTES[category], category, reason: "키워드 기반 분류", router: "규칙기반" };
}
