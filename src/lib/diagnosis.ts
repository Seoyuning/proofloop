import type { CoachPriority, DiagnosisMode, DiagnosisPayload, DiagnosisResult } from "@/lib/types";
import { getDiagnosisProvider } from "@/lib/ai";

const STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "with",
  "from",
  "this",
  "have",
  "what",
  "when",
  "then",
  "into",
  "should",
  "about",
  "there",
  "their",
  "while",
  "where",
  "using",
  "please",
  "code",
  "task",
  "todo",
  "react",
  "api",
  "data",
  "있는",
  "하는",
  "합니다",
  "하고",
  "에서",
  "으로",
  "에게",
  "대한",
  "위한",
  "과제",
  "기능",
  "설명",
  "작성",
  "구현",
  "학생",
  "교강사",
  "학습",
  "코드",
  "프로젝트",
  "한다",
  "해야",
  "필요하다",
  "필요",
  "설명해야",
  "관리해야",
  "있습니다",
  "있다",
  "됩니다",
  "합니다",
  "하는지",
  "어떻게",
  "무엇",
  "전체적",
]);

const DOMAIN_CONCEPTS = [
  "optimistic update",
  "rollback",
  "race condition",
  "requestid",
  "state lifting",
  "상위 컴포넌트",
  "상태",
  "작업 큐",
  "비동기 큐",
  "idempotency",
  "dead-letter queue",
  "retry",
  "worker",
  "human handoff",
  "개인정보",
  "환각",
  "안전장치",
  "메트릭",
];

const REFLECTION_PATTERNS = [
  /because/gi,
  /trade[- ]off/gi,
  /edge case/gi,
  /therefore/gi,
  /root cause/gi,
  /why/gi,
  /이유/gi,
  /왜냐/gi,
  /그래서/gi,
  /가정/gi,
  /비교/gi,
  /근거/gi,
  /문제는/gi,
  /원인은/gi,
];

const TRANSFER_PATTERNS = [
  /if we change/gi,
  /if the/gi,
  /next step/gi,
  /refactor/gi,
  /optimi[sz]e/gi,
  /fallback/gi,
  /rollback/gi,
  /확장/gi,
  /바꾸면/gi,
  /만약/gi,
  /다음 단계/gi,
  /예외/gi,
  /테스트/gi,
  /검증/gi,
];

const DEPENDENCE_PATTERNS = [
  /full code/gi,
  /entire solution/gi,
  /copy and paste/gi,
  /just give me/gi,
  /정답/gi,
  /전체 코드/gi,
  /그대로/gi,
  /복붙/gi,
  /바로 제출/gi,
];

const AGENCY_PATTERNS = [
  /i changed/gi,
  /i tested/gi,
  /i removed/gi,
  /i compared/gi,
  /직접/gi,
  /수정/gi,
  /실험/gi,
  /테스트/gi,
  /확인/gi,
  /분리/gi,
];

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict",
    "evidenceScore",
    "coachPriority",
    "strongestSignal",
    "opportunityWindow",
    "evidenceBreakdown",
    "riskFlags",
    "misconceptions",
    "defenseQuestions",
    "interventionPlan",
    "studentNudge",
    "instructorSummary",
  ],
  properties: {
    verdict: { type: "string" },
    evidenceScore: { type: "integer", minimum: 0, maximum: 100 },
    coachPriority: {
      type: "string",
      enum: ["Immediate", "This week", "Monitor"],
    },
    strongestSignal: { type: "string" },
    opportunityWindow: { type: "string" },
    evidenceBreakdown: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "score", "note"],
        properties: {
          label: {
            type: "string",
            enum: [
              "Concept coverage",
              "Transfer ability",
              "Reflection depth",
              "Independent thinking",
            ],
          },
          score: { type: "integer", minimum: 0, maximum: 100 },
          note: { type: "string" },
        },
      },
    },
    riskFlags: { type: "array", items: { type: "string" } },
    misconceptions: { type: "array", items: { type: "string" } },
    defenseQuestions: { type: "array", items: { type: "string" } },
    interventionPlan: { type: "array", items: { type: "string" } },
    studentNudge: { type: "string" },
    instructorSummary: { type: "string" },
  },
} as const;

const LIVE_ANALYSIS_TIMEOUT_MS = 8000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function tokenize(text: string) {
  return Array.from(
    text.toLowerCase().matchAll(/[가-힣a-z][가-힣a-z0-9#+-]{1,}/giu),
    (match) => match[0],
  );
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function extractConcepts(text: string) {
  const lowerText = text.toLowerCase();
  const phraseHits = DOMAIN_CONCEPTS.filter((concept) => lowerText.includes(concept.toLowerCase()));
  const counts = new Map<string, number>();

  for (const token of tokenize(text)) {
    if (STOPWORDS.has(token)) {
      continue;
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const tokenConcepts = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 6)
    .map(([token]) => token);

  return unique([...phraseHits, ...tokenConcepts]).slice(0, 6);
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function dimensionNote(score: number, dimension: string) {
  if (score >= 80) {
    return `${dimension} 증거가 충분합니다. 기초를 다시 설명하기보다 더 깊은 질문으로 확인해도 됩니다.`;
  }

  if (score >= 65) {
    return `${dimension} 신호는 보이지만, 짧은 구두 확인이나 손코딩 점검이 한 번 더 필요합니다.`;
  }

  return `${dimension} 증거가 약합니다. 결과물 완성 속도에 비해 이해 설명이 따라오지 못하고 있습니다.`;
}

function buildPriority(score: number, independenceScore: number): CoachPriority {
  if (score < 60 || independenceScore < 52) {
    return "Immediate";
  }

  if (score < 78) {
    return "This week";
  }

  return "Monitor";
}

export function heuristicDiagnosis(payload: DiagnosisPayload, mode: DiagnosisMode = "demo_ai"): DiagnosisResult {
  const concepts = extractConcepts(payload.assignmentBrief);
  const submissionTokens = new Set(tokenize(payload.submission));
  const traceText = `${payload.aiTrace}\n${payload.submission}`;
  const matchedConcepts = concepts.filter(
    (concept) =>
      submissionTokens.has(concept) || payload.submission.toLowerCase().includes(concept.toLowerCase()),
  );
  const missingConcepts = concepts.filter((concept) => !matchedConcepts.includes(concept));
  const coverage = concepts.length > 0 ? matchedConcepts.length / concepts.length : 0.5;
  const reflectionHits = countMatches(traceText, REFLECTION_PATTERNS);
  const transferHits = countMatches(traceText, TRANSFER_PATTERNS);
  const dependenceHits = countMatches(payload.aiTrace, DEPENDENCE_PATTERNS);
  const agencyHits = countMatches(traceText, AGENCY_PATTERNS);

  const conceptScore = clamp(38 + coverage * 48 + Math.min(payload.submission.length / 34, 16), 28, 96);
  const transferScore = clamp(35 + transferHits * 10 + Math.min(coverage * 25, 20), 24, 94);
  const reflectionScore = clamp(34 + reflectionHits * 11 + agencyHits * 3, 22, 95);
  const independenceScore = clamp(
    82 - dependenceHits * 13 - Math.min(payload.aiTrace.length / 75, 16) + agencyHits * 2,
    20,
    96,
  );
  const evidenceScore = clamp(
    conceptScore * 0.34 + transferScore * 0.23 + reflectionScore * 0.2 + independenceScore * 0.23,
    26,
    97,
  );

  const evidenceBreakdown = [
    { label: "Concept coverage", score: conceptScore, note: dimensionNote(conceptScore, "Concept coverage") },
    { label: "Transfer ability", score: transferScore, note: dimensionNote(transferScore, "Transfer ability") },
    { label: "Reflection depth", score: reflectionScore, note: dimensionNote(reflectionScore, "Reflection depth") },
    { label: "Independent thinking", score: independenceScore, note: dimensionNote(independenceScore, "Independent thinking") },
  ];

  const riskFlags: string[] = [];

  if (independenceScore < 60) {
    riskFlags.push("AI 대화 흔적에서 정답 요구 성향이 보여, 얕은 이해가 가려질 가능성이 있습니다.");
  }

  if (conceptScore < 62 && missingConcepts.length > 0) {
    riskFlags.push(`제출물에서 ${missingConcepts.slice(0, 2).join(", ")} 같은 핵심 개념 설명이 충분히 드러나지 않습니다.`);
  }

  if (transferScore < 64) {
    riskFlags.push("현재 결과물은 설명하지만, 요구사항이 바뀌었을 때 어떻게 수정할지는 보여주지 못했습니다.");
  }

  if (reflectionScore < 60) {
    riskFlags.push("왜 그렇게 설계했는지, 어떤 trade-off가 있었는지, 무엇이 원인이었는지에 대한 설명이 부족합니다.");
  }

  if (riskFlags.length === 0) {
    riskFlags.push("즉시 개입이 필요한 위험 신호는 크지 않습니다. 강한 개입보다 가벼운 경과 관찰이 적절합니다.");
  }

  const misconceptions = unique(
    [
      missingConcepts[0]
        ? `결과물은 언급하지만, ${missingConcepts[0]}가 전체 흐름에서 왜 필요한지는 충분히 설명하지 못합니다.`
        : "",
      dependenceHits > 0
        ? "AI 사용 방식이 힌트나 검증보다 정답 요청 쪽으로 기울어 있습니다."
        : "",
      transferScore < 68
        ? "입력 조건이나 실패 상황, 요구사항이 바뀌어도 해결 방식을 바꿀 수 있는지는 아직 드러나지 않았습니다."
        : "",
      reflectionScore < 63
        ? "설명이 결과 중심입니다. '무엇을 했다'는 보이지만, '왜 그렇게 했는지'는 상대적으로 약합니다."
        : "",
    ].filter(Boolean),
  ).slice(0, 3);

  const focusConcept = missingConcepts[0] ?? matchedConcepts[0] ?? "핵심 설계 판단";
  const defenseQuestions = unique(
    [
      `코드를 열지 말고 설명해 보세요. 왜 ${focusConcept}가 필요하고, 이걸 빼면 무엇이 깨지나요?`,
      "이 과제의 요구사항 하나를 바꾼다면, 어디를 가장 먼저 수정해야 하나요? 이유도 함께 설명해 보세요.",
      "실제 사용자나 교강사 피드백을 받는다면, 지금 해결 방식 중 무엇을 가장 먼저 되돌리거나 바꾸겠나요?",
    ],
  );

  const interventionPlan = [
    `${focusConcept}를 중심으로 3분짜리 구두 확인을 먼저 진행하고, 그다음 숙달 여부를 판단합니다.`,
    "조건이나 데이터 형태, 예외 상황을 하나 바꾼 전이 과제를 주고 바로 수정하게 해 보세요.",
    dependenceHits > 0
      ? "다음 세션부터는 '정답 요청' 대신 '힌트 우선' 프롬프트 템플릿을 쓰게 하고, AI 턴마다 짧은 회고를 남기게 하세요."
      : "AI 사용은 허용하되, 다음 제출에서는 trade-off 한 줄과 자기 점검 한 단계를 반드시 남기게 하세요.",
  ];

  const strongestSignal =
    evidenceScore >= 80
      ? "설명과 전이 신호가 충분해, 이 학습자는 다음 단계로 밀어줘도 괜찮습니다."
      : evidenceScore >= 66
        ? "분명한 진전은 있지만, 숙달로 인정하려면 교강사의 짧은 확인 질문이 한 번 더 필요합니다."
        : "결과물 완성 속도가 설명보다 앞서 있습니다. 숨은 학습 부채가 생길 때 자주 보이는 패턴입니다.";

  const opportunityWindow =
    evidenceScore >= 80
      ? "이 학습자는 피어 서포트나 멘토 역할까지 확장해도 될 정도로 설명 품질이 안정적입니다."
      : evidenceScore >= 66
        ? "지금 짧게 개입하면, 혼란이 자신감 착시로 굳기 전에 이해를 붙잡을 수 있습니다."
        : "지금이 개입 시점입니다. 설명 없이 결과물만 더 쌓이면 학습 격차가 빠르게 커집니다.";

  const verdict =
    evidenceScore >= 80
      ? "이해의 증거가 충분히 보입니다. 보충보다 확장 과제를 주는 편이 맞습니다."
      : evidenceScore >= 66
        ? "부분적인 이해는 보이지만, 진짜 숙달로 보기 전에 집중 확인이 한 번 더 필요합니다."
        : "제출은 끝났지만 이해의 증거는 아직 부족합니다. 다음 단계로 넘어가기 전에 개입이 필요합니다.";

  const coachPriority = buildPriority(evidenceScore, independenceScore);
  const studentNudge =
    dependenceHits > 0
      ? "다음 AI 요청부터는 '정답' 대신 '내 풀이의 약한 부분 2개만 지적해줘'처럼 질문하세요. 그래야 실력이 남습니다."
      : "좋습니다. 다음 제출에서는 '왜 이 구조를 택했는지'를 한 문장 더 남겨서 이해의 증거를 강화하세요.";

  const weakestMetricLabel =
    evidenceBreakdown
      .slice()
      .sort((left, right) => left.score - right.score)[0].label;

  const metricNameMap: Record<string, string> = {
    "Concept coverage": "핵심 개념 이해",
    "Transfer ability": "전이 및 응용",
    "Reflection depth": "설명과 반성 깊이",
    "Independent thinking": "독립적 사고",
  };

  const priorityNameMap: Record<CoachPriority, string> = {
    Immediate: "즉시 개입",
    "This week": "이번 주 코칭",
    Monitor: "경과 관찰",
  };

  const instructorSummary = `${payload.studentName || "이 학습자"}는 현재 '${priorityNameMap[coachPriority]}' 구간입니다. 가장 먼저 확인할 축은 '${metricNameMap[weakestMetricLabel] ?? weakestMetricLabel}'이며, 가장 빠른 검증 방법은 짧은 구두 확인과 즉석 전이 과제입니다.`;

  return {
    mode,
    verdict,
    evidenceScore,
    coachPriority,
    strongestSignal,
    opportunityWindow,
    evidenceBreakdown,
    riskFlags,
    misconceptions,
    defenseQuestions,
    interventionPlan,
    studentNudge,
    instructorSummary,
  };
}

function toScore(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : fallback;
}

function toNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  return next.length > 0 ? next : fallback;
}

function toMode(value: unknown): CoachPriority | null {
  return value === "Immediate" || value === "This week" || value === "Monitor" ? value : null;
}

export function normalizeDiagnosis(raw: unknown, fallback: DiagnosisResult, mode: DiagnosisMode): DiagnosisResult {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const value = raw as Record<string, unknown>;
  const coachPriority = toMode(value.coachPriority) ?? fallback.coachPriority;
  const evidenceBreakdown = Array.isArray(value.evidenceBreakdown)
    ? value.evidenceBreakdown
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return fallback.evidenceBreakdown[index];
          }

          const row = item as Record<string, unknown>;

          return {
            label:
              typeof row.label === "string" && row.label.trim().length > 0
                ? row.label.trim()
                : fallback.evidenceBreakdown[index]?.label ?? `지표 ${index + 1}`,
            score: toScore(row.score, fallback.evidenceBreakdown[index]?.score ?? 50),
            note: toNonEmptyString(
              row.note,
              fallback.evidenceBreakdown[index]?.note ?? "설명 정보가 충분하지 않습니다.",
            ),
          };
        })
        .slice(0, 4)
    : fallback.evidenceBreakdown;

  return {
    mode,
    verdict: toNonEmptyString(value.verdict, fallback.verdict),
    evidenceScore: toScore(value.evidenceScore, fallback.evidenceScore),
    coachPriority,
    strongestSignal: toNonEmptyString(value.strongestSignal, fallback.strongestSignal),
    opportunityWindow: toNonEmptyString(value.opportunityWindow, fallback.opportunityWindow),
    evidenceBreakdown:
      evidenceBreakdown.length === 4 ? evidenceBreakdown : fallback.evidenceBreakdown,
    riskFlags: toStringList(value.riskFlags, fallback.riskFlags).slice(0, 4),
    misconceptions: toStringList(value.misconceptions, fallback.misconceptions).slice(0, 4),
    defenseQuestions: toStringList(value.defenseQuestions, fallback.defenseQuestions).slice(0, 4),
    interventionPlan: toStringList(value.interventionPlan, fallback.interventionPlan).slice(0, 4),
    studentNudge: toNonEmptyString(value.studentNudge, fallback.studentNudge),
    instructorSummary: toNonEmptyString(value.instructorSummary, fallback.instructorSummary),
  };
}

function mergeLiveNarrativeWithFallbackMetrics(
  live: DiagnosisResult,
  fallback: DiagnosisResult,
): DiagnosisResult {
  return {
    ...live,
    evidenceScore: fallback.evidenceScore,
    coachPriority: fallback.coachPriority,
    evidenceBreakdown: fallback.evidenceBreakdown,
  };
}

export async function analyzeDiagnosis(payload: DiagnosisPayload) {
  const fallback = heuristicDiagnosis(payload, "demo_ai");
  const provider = getDiagnosisProvider();

  if (!provider) {
    return fallback;
  }

  const systemPrompt =
    "You analyze AI-assisted student work and produce instructor-ready JSON only. All narrative fields must be written in natural Korean.";

  const userPrompt = `You are ProofLoop, an educational reasoning auditor.

Return a balanced diagnosis of whether the learner truly understands the work.
Be specific, practical, and instructor-ready.
Use integer percentage scores from 0 to 100.
Use these exact evidenceBreakdown labels in this exact order:
1. Concept coverage
2. Transfer ability
3. Reflection depth
4. Independent thinking
Write every free-text field in natural Korean for Korean instructors and learners.
Return JSON only.

Payload:
${JSON.stringify(payload, null, 2)}`;

  try {
    const parsed = await provider.chatJson({
      systemPrompt,
      userPrompt,
      jsonSchema: schema,
      temperature: 0.2,
      timeoutMs: LIVE_ANALYSIS_TIMEOUT_MS,
    });

    const live = normalizeDiagnosis(parsed, fallback, "live_ai");
    return mergeLiveNarrativeWithFallbackMetrics(live, fallback);
  } catch (err) {
    console.error(`[diagnosis] ${provider.name} failed, falling back:`, err);
    return fallback;
  }
}

