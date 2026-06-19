import { getProvider } from "@/lib/ai";

export interface ExamItem {
  number: number;
  unit: string;
  difficulty: "기초" | "표준" | "심화";
  type: "선택" | "단답" | "서술";
  question: string;
  answer: string;
  rationale: string;
  trapWarning?: string;
}

export interface ExamDraft {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  classLabel: string;
  totalItems: number;
  estimatedMinutes: number;
  items: ExamItem[];
  coverageNote: string;
}

export interface PriorityItem {
  rank: number;
  unit: string;
  reason: string;
  recommendedAction: string;
  weeklyHours: number;
}

export interface LearningPriorities {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  studentName: string;
  context: string;
  topPriorities: PriorityItem[];
  curriculumRoadmap: Array<{ week: number; goal: string; activities: string[] }>;
}

const EXAM_FALLBACK: ExamItem[] = [
  {
    number: 1,
    unit: "이차함수의 그래프와 축",
    difficulty: "기초",
    type: "선택",
    question: "이차함수 y = (x-2)² + 3의 꼭짓점 좌표는?",
    answer: "(2, 3)",
    rationale: "표준형 y = a(x-p)² + q에서 꼭짓점은 (p, q).",
    trapWarning: "(-2, 3)으로 오답 빈출 — p의 부호 혼동",
  },
  {
    number: 2,
    unit: "이차함수의 그래프와 축",
    difficulty: "표준",
    type: "단답",
    question: "y = -2(x+1)² - 4가 위/아래 어느 쪽으로 볼록한가?",
    answer: "아래로 볼록",
    rationale: "a < 0이면 그래프는 아래로 볼록.",
  },
  {
    number: 3,
    unit: "이차방정식과 근의 공식",
    difficulty: "표준",
    type: "선택",
    question: "x² - 4x + 5 = 0의 근의 종류는?",
    answer: "허근 2개",
    rationale: "판별식 D = 16 - 20 = -4 < 0이므로 허근.",
    trapWarning: "'풀이 불가'로 오답하는 학생 다수 — 허근 개념 누락",
  },
  {
    number: 4,
    unit: "이차방정식과 근의 공식",
    difficulty: "심화",
    type: "서술",
    question: "이차방정식 ax² + bx + c = 0의 근의 공식이 √(b² - 4ac) 부분을 포함하는 이유를 자기 말로 설명하세요.",
    answer: "(예시) 완전제곱식으로 변형 시 양변에 더해주는 항이 (b/2a)²이고, 이를 정리하면 b²-4ac가 √ 안에 남기 때문.",
    rationale: "완전제곱식 유도 과정 이해 여부를 묻는 서술형. 단순 암기 차단.",
  },
  {
    number: 5,
    unit: "확률의 독립과 종속",
    difficulty: "표준",
    type: "선택",
    question: "두 사건 A, B가 독립일 때 P(A∩B)는?",
    answer: "P(A) × P(B)",
    rationale: "독립 사건의 확률 곱셈 정리.",
  },
  {
    number: 6,
    unit: "확률의 독립과 종속",
    difficulty: "심화",
    type: "서술",
    question: "복원 추출과 비복원 추출의 차이를, 동전 또는 주사위 예시를 들어 설명하세요.",
    answer: "(예시) 복원 추출은 매 시행이 독립, 비복원 추출은 종속. 주사위를 두 번 굴리는 것은 복원과 같음.",
    rationale: "독립·종속 개념의 일상 응용 평가.",
  },
];

export function heuristicExamDraft(): ExamDraft {
  return {
    mode: "demo_ai",
    modelName: "heuristic-fallback",
    classLabel: "중3 1학기 수학",
    totalItems: EXAM_FALLBACK.length,
    estimatedMinutes: 35,
    items: EXAM_FALLBACK,
    coverageNote: "학생 데이터에서 도출된 주요 약점 단원 3개를 기초·표준·심화로 균형 배치했습니다.",
  };
}

export async function generateExamDraft(): Promise<ExamDraft> {
  const fallback = heuristicExamDraft();
  const provider = getProvider("planning");
  if (!provider) return fallback;

  const systemPrompt =
    "You are an expert Korean middle/high school math test author. Use SKT A.X K1's planning capability to design a balanced exam draft from the given weak-unit data. Output JSON only. All Korean.";

  const userPrompt = `다음 데이터를 기반으로 6문항 시험 초안을 작성하세요. 단원별 약점·오개념을 변별 문항에 반영하세요.

[학생 데이터 요약]
- 약점 단원: 이차함수의 그래프와 축, 이차방정식과 근의 공식, 확률의 독립과 종속
- 반복 오개념: 꼭짓점 좌표 부호 혼동, 근의 공식 판별식 오해, 확률 독립·종속 구분 어려움

JSON 스키마:
- items: 배열 (6개). 각각 number/unit/difficulty/type/question/answer/rationale/trapWarning(선택)
- coverageNote: 시험 구성 의도 1문장`;

  try {
    const parsed = (await provider.chatJson({
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      timeoutMs: 25000,
    })) as Partial<ExamDraft>;
    return {
      ...fallback,
      mode: "live_ai",
      modelName: provider.name,
      items: Array.isArray(parsed.items) && parsed.items.length > 0 ? (parsed.items as ExamItem[]) : fallback.items,
      coverageNote: typeof parsed.coverageNote === "string" ? parsed.coverageNote : fallback.coverageNote,
    };
  } catch (err) {
    console.error(`[exam-draft] ${provider.name} failed:`, err);
    return fallback;
  }
}

const PRIORITIES_FALLBACK: LearningPriorities = {
  mode: "demo_ai",
  modelName: "heuristic-fallback",
  studentName: "민준",
  context: "방학 4주(주당 8시간 가용) 기준 우선순위 학습 계획",
  topPriorities: [
    {
      rank: 1,
      unit: "이차방정식과 근의 공식",
      reason: "학기 내내 평균 이해도 2.0/5. 14주 누적된 약점이며 다음 학기 함수 단원 선행 필수.",
      recommendedAction: "완전제곱식 유도 과정을 손으로 3번 직접 작성. 판별식 의미 서술 연습.",
      weeklyHours: 4,
    },
    {
      rank: 2,
      unit: "이차함수의 그래프와 축",
      reason: "꼭짓점 좌표 부호를 반복적으로 혼동. 응용 문제로 확장 시 오류율 70%.",
      recommendedAction: "표준형↔일반형 변환 10문항. 그래프 그리기 5문항.",
      weeklyHours: 2,
    },
    {
      rank: 3,
      unit: "확률의 독립과 종속",
      reason: "공식은 알지만 일상 예시로 연결하지 못함. 서술형에서 약함.",
      recommendedAction: "복원·비복원 비교 표 직접 작성. 일상 사례 3개 글로 정리.",
      weeklyHours: 2,
    },
  ],
  curriculumRoadmap: [
    {
      week: 1,
      goal: "이차방정식 기초 회복",
      activities: ["완전제곱식 유도 손으로 작성 (3회)", "근의 공식 암기 → 자기 말 설명", "기초 30문항 풀이"],
    },
    {
      week: 2,
      goal: "이차함수 그래프 응용",
      activities: ["꼭짓점·축 변환 연습 20문항", "그래프 그리기 손으로 10번", "오개념 자가 점검"],
    },
    {
      week: 3,
      goal: "확률 개념 재정립",
      activities: ["독립·종속 표 작성", "일상 예시 3개 서술", "복합 사건 5문항"],
    },
    {
      week: 4,
      goal: "통합 점검",
      activities: ["3개 단원 모의시험", "서술형 4문항 자기 채점", "다음 학기 선행 1단원"],
    },
  ],
};

export function heuristicPriorities(): LearningPriorities {
  return PRIORITIES_FALLBACK;
}

export async function generatePriorities(studentName: string): Promise<LearningPriorities> {
  const fallback = { ...PRIORITIES_FALLBACK, studentName };
  const provider = getProvider("planning");
  if (!provider) return fallback;

  const systemPrompt =
    "You are an expert tutor planning a 4-week vacation curriculum for a Korean middle school student, prioritized by weakness data. Use SKT A.X K1's task-decomposition strength. Output JSON only.";

  const userPrompt = `학생: ${studentName}
약점: 이차방정식과 근의 공식 (평균 이해도 2.0), 이차함수의 그래프와 축 (2.4), 확률의 독립과 종속 (2.8)
반복 오개념: 꼭짓점 좌표 부호 혼동, 근의 공식 판별식 오해

다음 JSON을 작성:
- topPriorities: 1~3순위. 각각 rank/unit/reason/recommendedAction/weeklyHours
- curriculumRoadmap: 4주차 로드맵. 각 주마다 week/goal/activities[]
- context: 한 문장 요약`;

  try {
    const parsed = (await provider.chatJson({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      timeoutMs: 20000,
    })) as Partial<LearningPriorities>;
    return {
      ...fallback,
      mode: "live_ai",
      modelName: provider.name,
      topPriorities: Array.isArray(parsed.topPriorities) && parsed.topPriorities.length > 0
        ? (parsed.topPriorities as PriorityItem[])
        : fallback.topPriorities,
      curriculumRoadmap: Array.isArray(parsed.curriculumRoadmap) && parsed.curriculumRoadmap.length > 0
        ? (parsed.curriculumRoadmap as LearningPriorities["curriculumRoadmap"])
        : fallback.curriculumRoadmap,
      context: typeof parsed.context === "string" ? parsed.context : fallback.context,
    };
  } catch (err) {
    console.error(`[priorities] ${provider.name} failed:`, err);
    return fallback;
  }
}
