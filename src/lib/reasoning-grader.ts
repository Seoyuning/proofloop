import { getProvider } from "@/lib/ai";

export interface SolutionStep {
  step: number;
  studentWrote: string;
  status: "ok" | "warn" | "error";
  comment: string;
}

export interface SolutionGrading {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  question: string;
  studentSolution: string;
  steps: SolutionStep[];
  finalVerdict: "정답" | "부분 정답" | "오답";
  errorPinpoint: string;
  followUpQuestion: string;
  conceptLinks: Array<{ from: string; to: string; bridge: string }>;
}

const GRADING_FALLBACK: SolutionGrading = {
  mode: "demo_ai",
  modelName: "heuristic-fallback",
  question: "이차함수 y = (x-2)² + 3 의 꼭짓점 좌표를 구하세요.",
  studentSolution: "y = (x-2)² + 3 이므로 꼭짓점은 (-2, 3)입니다. 왜냐하면 (x-2)² 에서 x가 -2일 때 0이 되기 때문입니다.",
  steps: [
    {
      step: 1,
      studentWrote: "y = (x-2)² + 3 이므로 꼭짓점은 (-2, 3)입니다.",
      status: "error",
      comment: "표준형 y = a(x-p)² + q에서 꼭짓점은 (p, q). p의 부호를 그대로 옮겨야 함. (x-2)² 에서 p = +2.",
    },
    {
      step: 2,
      studentWrote: "왜냐하면 (x-2)² 에서 x가 -2일 때 0이 되기 때문입니다.",
      status: "error",
      comment: "(x-2)² 가 0이 되는 x는 +2 (x = 2일 때 (2-2)² = 0). x = -2를 넣으면 (-2-2)² = 16.",
    },
  ],
  finalVerdict: "오답",
  errorPinpoint: "표준형 (x-p)² 에서 p의 부호 처리. 단순 대입 검증으로 확인 가능했으나 그 절차를 거치지 않음.",
  followUpQuestion: "x = 2를 식에 직접 대입해서 y가 얼마가 되는지 계산해 보세요. 그게 꼭짓점의 y좌표와 어떤 관계인가요?",
  conceptLinks: [
    {
      from: "표준형 변환",
      to: "함수값 계산",
      bridge: "x = p를 대입하면 (x-p)² = 0이 되어 y = q. 즉 꼭짓점 좌표 = (p, q)는 단순 대입으로 검증됨.",
    },
    {
      from: "꼭짓점 좌표",
      to: "그래프 평행이동",
      bridge: "표준형의 (p, q)는 y = ax² 그래프를 (p, q)만큼 평행이동한 결과.",
    },
  ],
};

export function heuristicGrading(question: string, studentSolution: string): SolutionGrading {
  return { ...GRADING_FALLBACK, question, studentSolution };
}

export async function gradeSolution(question: string, studentSolution: string): Promise<SolutionGrading> {
  const fallback = heuristicGrading(question, studentSolution);
  const provider = getProvider("reasoning");
  if (!provider) return fallback;

  const systemPrompt =
    "You are an expert Korean math/science tutor using LG K-EXAONE's reasoning mode to grade student solutions step-by-step. Pinpoint the EXACT step where logic breaks. Suggest a follow-up question that tests the underlying concept. Output JSON only. All Korean.";

  const userPrompt = `[문제]
${question}

[학생 풀이]
${studentSolution}

다음 JSON을 작성:
- steps: 학생 풀이를 단계별로 나누고 각 step의 status(ok/warn/error)와 comment(한 문장 이유)
- finalVerdict: "정답" | "부분 정답" | "오답"
- errorPinpoint: 어느 단계에서 무엇이 어긋났는지 핀포인트 (1~2문장)
- followUpQuestion: 같은 개념을 다른 각도로 묻는 서술형 질문
- conceptLinks: 이 문제와 연결된 다른 개념들 1~3개. 각각 from/to/bridge`;

  try {
    const parsed = (await provider.chatJson({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      timeoutMs: 25000,
    })) as Partial<SolutionGrading>;
    return {
      ...fallback,
      mode: "live_ai",
      modelName: provider.name,
      steps: Array.isArray(parsed.steps) && parsed.steps.length > 0 ? (parsed.steps as SolutionStep[]) : fallback.steps,
      finalVerdict: parsed.finalVerdict || fallback.finalVerdict,
      errorPinpoint: typeof parsed.errorPinpoint === "string" ? parsed.errorPinpoint : fallback.errorPinpoint,
      followUpQuestion: typeof parsed.followUpQuestion === "string" ? parsed.followUpQuestion : fallback.followUpQuestion,
      conceptLinks: Array.isArray(parsed.conceptLinks) && parsed.conceptLinks.length > 0
        ? (parsed.conceptLinks as SolutionGrading["conceptLinks"])
        : fallback.conceptLinks,
    };
  } catch (err) {
    console.error(`[reasoning] ${provider.name} failed:`, err);
    return fallback;
  }
}
