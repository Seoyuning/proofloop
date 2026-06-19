import { getProvider } from "@/lib/ai";

export type SemesterReportSeverity = "high" | "mid" | "low";

export interface SemesterReportLearningDebt {
  unit: string;
  weeksUnsolved: number;
  severity: SemesterReportSeverity;
  evidence: string;
}

export interface SemesterReportTrendPoint {
  week: string;
  level: number;
}

export interface SemesterReportMisconception {
  name: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface SemesterReport {
  mode: "live_ai" | "demo_ai";
  studentName: string;
  classLabel: string;
  period: string;
  totalQuestions: number;
  averageUnderstanding: number;
  understandingTrend: SemesterReportTrendPoint[];
  learningDebt: SemesterReportLearningDebt[];
  recurringMisconceptions: SemesterReportMisconception[];
  summaryNarrative: string;
  recommendedFocus: string[];
  parentNote: string;
  generatedAt: string;
  modelName: string;
}

export interface SemesterReportInput {
  studentName: string;
  classLabel: string;
  period: string;
  chatLog: Array<{
    week: string;
    role: "student" | "assistant";
    text: string;
    unit?: string;
    understanding?: number;
  }>;
  misconceptionTags: string[];
  weakSections: Array<{ unit: string; avgUnderstanding: number; questionCount: number }>;
}

const SEVERITY_THRESHOLD_HIGH = 5;
const SEVERITY_THRESHOLD_MID = 3;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function severityFromWeeks(weeks: number): SemesterReportSeverity {
  if (weeks >= SEVERITY_THRESHOLD_HIGH) return "high";
  if (weeks >= SEVERITY_THRESHOLD_MID) return "mid";
  return "low";
}

function aggregateTrend(input: SemesterReportInput): SemesterReportTrendPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const entry of input.chatLog) {
    if (entry.role !== "assistant" || typeof entry.understanding !== "number") continue;
    const week = entry.week;
    const bucket = buckets.get(week) ?? { sum: 0, count: 0 };
    bucket.sum += entry.understanding;
    bucket.count += 1;
    buckets.set(week, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, b]) => ({ week, level: Math.round((b.sum / Math.max(b.count, 1)) * 10) / 10 }));
}

function aggregateMisconceptions(input: SemesterReportInput): SemesterReportMisconception[] {
  const counts = new Map<string, { count: number; firstSeen: string; lastSeen: string }>();
  for (const tag of input.misconceptionTags) {
    const key = tag.trim();
    if (!key) continue;
    const cur = counts.get(key) ?? { count: 0, firstSeen: "", lastSeen: "" };
    cur.count += 1;
    counts.set(key, cur);
  }
  return Array.from(counts.entries())
    .map(([name, c]) => ({ name, count: c.count, firstSeen: c.firstSeen || "—", lastSeen: c.lastSeen || "—" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function deriveLearningDebt(input: SemesterReportInput): SemesterReportLearningDebt[] {
  return input.weakSections
    .filter((s) => s.avgUnderstanding < 3.5)
    .slice(0, 5)
    .map((s) => {
      const weeksUnsolved = clamp(Math.round((3.5 - s.avgUnderstanding) * 4), 1, 12);
      return {
        unit: s.unit,
        weeksUnsolved,
        severity: severityFromWeeks(weeksUnsolved),
        evidence: `이 단원에서 ${s.questionCount}회 질문, 평균 이해도 ${s.avgUnderstanding.toFixed(1)}점.`,
      };
    });
}

export function heuristicSemesterReport(input: SemesterReportInput): SemesterReport {
  const trend = aggregateTrend(input);
  const recurring = aggregateMisconceptions(input);
  const debt = deriveLearningDebt(input);
  const total = input.chatLog.filter((e) => e.role === "student").length;
  const avg =
    trend.length > 0
      ? Math.round((trend.reduce((s, t) => s + t.level, 0) / trend.length) * 10) / 10
      : 0;

  const debtUnits = debt.map((d) => d.unit).join(", ") || "특별한 학습 부채는 발견되지 않았습니다";
  const trendNarrative =
    trend.length >= 2
      ? trend[trend.length - 1].level >= trend[0].level
        ? "학기 시작에 비해 이해도가 점진적으로 상승했습니다."
        : "학기 후반 들어 이해도가 낮아지는 구간이 관찰됩니다."
      : "학기 데이터가 충분하지 않아 추세 판단이 제한적입니다.";

  const summaryNarrative = `${input.studentName} 학생은 ${input.period} 동안 총 ${total}회의 질문을 통해 학습을 이어왔습니다. 평균 이해도는 ${avg}점이며, ${trendNarrative} 가장 반복적으로 짚어야 할 단원은 ${debtUnits}입니다.`;

  const recommendedFocus = debt.length > 0
    ? debt.map((d) => `${d.unit} — ${d.weeksUnsolved}주간 누적된 약점, ${d.severity === "high" ? "방학 1순위" : d.severity === "mid" ? "방학 중반에 보강" : "가벼운 복습"}`)
    : [`${input.classLabel}에서 다음 학기 선행 학습을 권장합니다.`, "기존 강점을 유지하기 위한 심화 과제 추천"];

  const parentNote = debt.length > 0
    ? `${input.studentName} 학생은 ${input.period} 동안 ${total}회 질문하며 꾸준히 학습했습니다. 다만 ${debtUnits} 영역에서 학기 동안 해결되지 않은 어려움이 있어, 방학 동안 ${debt[0].unit}을 우선 짚고 넘어가시면 다음 학기 출발이 안정적이겠습니다.`
    : `${input.studentName} 학생은 ${input.period} 동안 ${total}회 질문하며 안정적인 학습 곡선을 보여주었습니다. 현재 강점이 잘 유지되고 있어 방학 동안에도 일관된 학습 페이스를 유지하시면 충분합니다.`;

  return {
    mode: "demo_ai",
    studentName: input.studentName,
    classLabel: input.classLabel,
    period: input.period,
    totalQuestions: total,
    averageUnderstanding: avg,
    understandingTrend: trend,
    learningDebt: debt,
    recurringMisconceptions: recurring,
    summaryNarrative,
    recommendedFocus,
    parentNote,
    generatedAt: new Date().toISOString(),
    modelName: "heuristic-fallback",
  };
}

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summaryNarrative", "learningDebt", "recommendedFocus", "parentNote"],
  properties: {
    summaryNarrative: { type: "string" },
    learningDebt: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["unit", "weeksUnsolved", "severity", "evidence"],
        properties: {
          unit: { type: "string" },
          weeksUnsolved: { type: "integer", minimum: 1, maximum: 20 },
          severity: { type: "string", enum: ["high", "mid", "low"] },
          evidence: { type: "string" },
        },
      },
    },
    recommendedFocus: { type: "array", items: { type: "string" } },
    parentNote: { type: "string" },
  },
} as const;

export async function generateSemesterReport(input: SemesterReportInput): Promise<SemesterReport> {
  const fallback = heuristicSemesterReport(input);
  const provider = getProvider("long-context");
  if (!provider) return fallback;

  const systemPrompt =
    "You analyze a Korean student's semester-long learning conversation log and produce a structured Korean report for instructors and parents. Use 128K-context capability to consider the full term. Return JSON only. All narrative fields must be in natural Korean.";

  const userPrompt = `학생: ${input.studentName}
반: ${input.classLabel}
기간: ${input.period}

[휴리스틱 사전 집계]
- 총 학생 질문: ${fallback.totalQuestions}회
- 평균 이해도: ${fallback.averageUnderstanding}/5
- 약점 단원: ${fallback.learningDebt.map((d) => `${d.unit}(${d.weeksUnsolved}주)`).join(", ") || "(없음)"}
- 반복 오개념: ${fallback.recurringMisconceptions.map((m) => `${m.name}(${m.count}회)`).join(", ") || "(없음)"}

[학기 채팅 로그]
${input.chatLog
  .slice(-200)
  .map((e) => `[${e.week}] ${e.role === "student" ? "학생" : "AI"}${e.unit ? `(${e.unit})` : ""}: ${e.text}`)
  .join("\n")}

위 데이터를 바탕으로 다음 JSON을 작성하세요:
- summaryNarrative: 학기 학습 흐름 요약 (3~4문장, 객관 사실 중심)
- learningDebt: 학기 동안 해결되지 않은 약점 단원 1~5개. 각각 unit/weeksUnsolved/severity/evidence
- recommendedFocus: 방학 학습 권고 항목 3~5개 (구체적, 실행 가능)
- parentNote: 학부모 면담용 1문단 (전문용어 풀어서, 따뜻한 어조)`;

  try {
    const parsed = (await provider.chatJson({
      systemPrompt,
      userPrompt,
      jsonSchema: reportSchema,
      temperature: 0.2,
      timeoutMs: 20000,
    })) as Partial<SemesterReport>;

    return {
      ...fallback,
      mode: "live_ai",
      summaryNarrative: typeof parsed.summaryNarrative === "string" ? parsed.summaryNarrative : fallback.summaryNarrative,
      learningDebt: Array.isArray(parsed.learningDebt) && parsed.learningDebt.length > 0
        ? (parsed.learningDebt as SemesterReportLearningDebt[])
        : fallback.learningDebt,
      recommendedFocus: Array.isArray(parsed.recommendedFocus) && parsed.recommendedFocus.length > 0
        ? (parsed.recommendedFocus as string[])
        : fallback.recommendedFocus,
      parentNote: typeof parsed.parentNote === "string" ? parsed.parentNote : fallback.parentNote,
      modelName: provider.name,
    };
  } catch (err) {
    console.error(`[semester-report] ${provider.name} failed:`, err);
    return fallback;
  }
}
