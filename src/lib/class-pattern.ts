import { getProvider } from "@/lib/ai";
import { buildFixtureInput, FIXTURE_STUDENTS } from "@/lib/semester-report-fixture";

export interface ClassPatternStudentSnapshot {
  studentId: string;
  studentName: string;
  averageUnderstanding: number;
  totalQuestions: number;
  weakUnits: string[];
}

export interface ClassPatternUnitWeakness {
  unit: string;
  affectedStudents: number;
  averageUnderstanding: number;
  severity: "high" | "mid" | "low";
}

export interface ClassPatternMisconception {
  name: string;
  affectedCount: number;
  example: string;
}

export interface ClassPatternGrouping {
  groupName: string;
  studentNames: string[];
  focus: string;
}

export interface ClassPatternReport {
  mode: "live_ai" | "demo_ai";
  classLabel: string;
  period: string;
  studentCount: number;
  classAverageUnderstanding: number;
  understandingDistribution: Array<{ range: string; count: number }>;
  perStudent: ClassPatternStudentSnapshot[];
  commonWeakUnits: ClassPatternUnitWeakness[];
  classWideMisconceptions: ClassPatternMisconception[];
  groupingSuggestions: ClassPatternGrouping[];
  teachingRecommendations: string[];
  summaryNarrative: string;
  modelName: string;
}

function severityFromUnderstanding(level: number): "high" | "mid" | "low" {
  if (level < 2.5) return "high";
  if (level < 3.5) return "mid";
  return "low";
}

export function heuristicClassPattern(period: string): ClassPatternReport {
  const snapshots: ClassPatternStudentSnapshot[] = FIXTURE_STUDENTS.map((s) => {
    const input = buildFixtureInput(s.id, period);
    const understandings = input.chatLog
      .filter((e) => typeof e.understanding === "number")
      .map((e) => e.understanding as number);
    const avg = understandings.length > 0
      ? Math.round((understandings.reduce((a, b) => a + b, 0) / understandings.length) * 10) / 10
      : 0;
    return {
      studentId: s.id,
      studentName: s.name,
      averageUnderstanding: avg,
      totalQuestions: input.chatLog.filter((e) => e.role === "student").length,
      weakUnits: input.weakSections.map((w) => w.unit),
    };
  });

  const studentCount = snapshots.length;
  const classAvg =
    Math.round(
      (snapshots.reduce((sum, s) => sum + s.averageUnderstanding, 0) / Math.max(studentCount, 1)) * 10,
    ) / 10;

  const distBuckets = { "1.0–2.0": 0, "2.1–3.0": 0, "3.1–4.0": 0, "4.1–5.0": 0 };
  snapshots.forEach((s) => {
    if (s.averageUnderstanding <= 2.0) distBuckets["1.0–2.0"] += 1;
    else if (s.averageUnderstanding <= 3.0) distBuckets["2.1–3.0"] += 1;
    else if (s.averageUnderstanding <= 4.0) distBuckets["3.1–4.0"] += 1;
    else distBuckets["4.1–5.0"] += 1;
  });

  const unitMap = new Map<string, { count: number; sum: number }>();
  snapshots.forEach((s) => {
    s.weakUnits.forEach((unit) => {
      const cur = unitMap.get(unit) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += s.averageUnderstanding;
      unitMap.set(unit, cur);
    });
  });

  const commonWeakUnits: ClassPatternUnitWeakness[] = Array.from(unitMap.entries())
    .map(([unit, c]) => ({
      unit,
      affectedStudents: c.count,
      averageUnderstanding: Math.round((c.sum / c.count) * 10) / 10,
      severity: severityFromUnderstanding(c.sum / c.count),
    }))
    .sort((a, b) => b.affectedStudents - a.affectedStudents);

  const classWideMisconceptions: ClassPatternMisconception[] = [
    {
      name: "꼭짓점 좌표 부호 혼동",
      affectedCount: snapshots.filter((s) => s.weakUnits.includes("이차함수의 그래프와 축")).length,
      example: "y = (x-2)² 의 꼭짓점을 (-2, 0)으로 잘못 답하는 학생 다수",
    },
    {
      name: "근의 공식 판별식 오해",
      affectedCount: snapshots.filter((s) => s.weakUnits.includes("이차방정식과 근의 공식")).length,
      example: "b²-4ac < 0일 때 '풀이 불가'로 답하고 허근 개념 누락",
    },
    {
      name: "확률 독립·종속 구분",
      affectedCount: snapshots.filter((s) => s.weakUnits.includes("확률의 독립과 종속")).length,
      example: "복원 추출과 비복원 추출의 차이를 식으로 연결하지 못함",
    },
  ].filter((m) => m.affectedCount > 0);

  const lowGroup = snapshots.filter((s) => s.averageUnderstanding < 3).map((s) => s.studentName);
  const midGroup = snapshots.filter((s) => s.averageUnderstanding >= 3 && s.averageUnderstanding < 4).map((s) => s.studentName);
  const highGroup = snapshots.filter((s) => s.averageUnderstanding >= 4).map((s) => s.studentName);

  const groupingSuggestions: ClassPatternGrouping[] = [
    lowGroup.length > 0 && {
      groupName: "집중 보강조",
      studentNames: lowGroup,
      focus: "기초 개념부터 다시. 매주 1회 짧은 구두 확인 필요.",
    },
    midGroup.length > 0 && {
      groupName: "전이 응용조",
      studentNames: midGroup,
      focus: "개념은 알지만 응용 약함. 변형 문제로 연결 학습.",
    },
    highGroup.length > 0 && {
      groupName: "심화 도전조",
      studentNames: highGroup,
      focus: "개념 안정. 또래 멘토 또는 심화 과제 부여.",
    },
  ].filter(Boolean) as ClassPatternGrouping[];

  const summaryNarrative = `${period} 동안 반 평균 이해도는 ${classAvg}점이며, ${commonWeakUnits[0]?.unit ?? "전반"} 단원에서 가장 많은 학생이 어려움을 겪고 있습니다. 학습 격차가 ${distBuckets["1.0–2.0"] + distBuckets["2.1–3.0"]}명(저)과 ${distBuckets["4.1–5.0"]}명(고) 사이에서 벌어져 있어, 단순 일제식 보강보다는 그룹별 차별화된 접근이 필요합니다.`;

  const teachingRecommendations = [
    `다음 수업 도입부 5분에 '${commonWeakUnits[0]?.unit ?? "최약 단원"}' 핵심 개념 재확인 진행`,
    `'집중 보강조' 학생들에게는 짧은 구두 확인 → 즉시 개입 흐름 적용`,
    `반 전체 오개념 ${classWideMisconceptions[0]?.name ?? "공통 오개념"} 을 다음 시험에서 변별 문항으로 구성`,
    `'심화 도전조' 학생들을 또래 멘토로 활용해 보강조 학습 효과 극대화`,
  ];

  return {
    mode: "demo_ai",
    classLabel: "중3 1학기 수학 (비상교육)",
    period,
    studentCount,
    classAverageUnderstanding: classAvg,
    understandingDistribution: Object.entries(distBuckets).map(([range, count]) => ({ range, count })),
    perStudent: snapshots,
    commonWeakUnits,
    classWideMisconceptions,
    groupingSuggestions,
    teachingRecommendations,
    summaryNarrative,
    modelName: "heuristic-fallback",
  };
}

export async function generateClassPattern(period: string): Promise<ClassPatternReport> {
  const fallback = heuristicClassPattern(period);
  const provider = getProvider("long-context");
  if (!provider) return fallback;

  const systemPrompt =
    "You analyze a Korean classroom's full-semester learning data (multiple students, all chats and diagnoses) and produce a structured Korean teaching report. Use 128K context to consider every student's term together. Return JSON only.";

  const userPrompt = `반: ${fallback.classLabel}
기간: ${period}
학생 수: ${fallback.studentCount}명
반 평균 이해도: ${fallback.classAverageUnderstanding}/5

[학생별 스냅샷]
${fallback.perStudent.map((s) => `- ${s.studentName}: 평균 ${s.averageUnderstanding}, ${s.totalQuestions}회 질문, 약점: ${s.weakUnits.join("/") || "없음"}`).join("\n")}

[공통 약점 단원]
${fallback.commonWeakUnits.map((u) => `- ${u.unit}: ${u.affectedStudents}명 영향, 평균 ${u.averageUnderstanding}`).join("\n")}

위 데이터를 종합 분석하여 다음 JSON을 반환:
- summaryNarrative: 반 학습 흐름 종합 진단 3~4문장
- teachingRecommendations: 교사가 다음 수업·시험에 즉시 적용할 권고 4~5개
- classWideMisconceptions: 반 전체에 퍼진 오개념 패턴. 각각 name/affectedCount/example`;

  try {
    const parsed = (await provider.chatJson({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      timeoutMs: 25000,
    })) as Partial<ClassPatternReport>;

    return {
      ...fallback,
      mode: "live_ai",
      summaryNarrative: typeof parsed.summaryNarrative === "string" ? parsed.summaryNarrative : fallback.summaryNarrative,
      teachingRecommendations: Array.isArray(parsed.teachingRecommendations) && parsed.teachingRecommendations.length > 0
        ? (parsed.teachingRecommendations as string[])
        : fallback.teachingRecommendations,
      classWideMisconceptions: Array.isArray(parsed.classWideMisconceptions) && parsed.classWideMisconceptions.length > 0
        ? (parsed.classWideMisconceptions as ClassPatternMisconception[])
        : fallback.classWideMisconceptions,
      modelName: provider.name,
    };
  } catch (err) {
    console.error(`[class-pattern] ${provider.name} failed:`, err);
    return fallback;
  }
}
