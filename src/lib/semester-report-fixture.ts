import type { SemesterReportInput } from "@/lib/semester-report";

// 시연·로컬 개발용 더미 학기 데이터
// 실제 운영 시 Supabase chat_messages / student_questions 테이블에서 조회
export const FIXTURE_STUDENTS: Array<{ id: string; name: string; classLabel: string }> = [
  { id: "minjun", name: "민준", classLabel: "중3 1학기 수학 (비상교육)" },
  { id: "seoyeon", name: "서연", classLabel: "중3 1학기 수학 (비상교육)" },
  { id: "doyun", name: "도윤", classLabel: "중3 1학기 수학 (비상교육)" },
  { id: "jiwoo", name: "지우", classLabel: "중3 1학기 수학 (비상교육)" },
];

const WEEKS = ["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W09", "W10", "W11", "W12"];

function buildLog(profile: "weak" | "strong" | "declining" | "recovering"): SemesterReportInput["chatLog"] {
  const baseUnits = ["이차함수의 그래프와 축", "이차방정식과 근의 공식", "확률의 독립과 종속", "함수의 정의역·치역"];

  const understandingByWeek: Record<typeof profile, number[]> = {
    weak:       [2, 2, 2, 1, 2, 2, 3, 2, 2, 1, 2, 2],
    strong:     [4, 4, 5, 4, 5, 4, 5, 5, 4, 5, 5, 4],
    declining:  [4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 2, 2],
    recovering: [2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4],
  };

  const log: SemesterReportInput["chatLog"] = [];
  const understandingArr = understandingByWeek[profile];

  WEEKS.forEach((week, wIdx) => {
    const u = understandingArr[wIdx];
    const unit = baseUnits[wIdx % baseUnits.length];

    log.push({
      week,
      role: "student",
      text: `${unit} 관련 질문이 있습니다.`,
      unit,
    });
    log.push({
      week,
      role: "assistant",
      text: `${unit}에 대한 설명입니다.`,
      unit,
      understanding: u,
    });
  });

  return log;
}

export function buildFixtureInput(studentId: string, period: string): SemesterReportInput {
  const student = FIXTURE_STUDENTS.find((s) => s.id === studentId) ?? FIXTURE_STUDENTS[0];

  const profile =
    student.id === "minjun"
      ? "weak"
      : student.id === "seoyeon"
        ? "strong"
        : student.id === "doyun"
          ? "declining"
          : "recovering";

  const log = buildLog(profile);

  const misconceptionTags =
    profile === "weak"
      ? ["꼭짓점 좌표 부호 혼동", "꼭짓점 좌표 부호 혼동", "근의 공식 판별식 오해", "확률 독립·종속 구분 어려움"]
      : profile === "strong"
        ? ["함수 정의역 이해 부족"]
        : profile === "declining"
          ? ["꼭짓점 좌표 부호 혼동", "꼭짓점 좌표 부호 혼동", "꼭짓점 좌표 부호 혼동", "근의 공식 판별식 오해", "근의 공식 판별식 오해"]
          : ["근의 공식 판별식 오해", "확률 독립·종속 구분 어려움"];

  const weakSections =
    profile === "weak"
      ? [
          { unit: "이차함수의 그래프와 축", avgUnderstanding: 2.0, questionCount: 18 },
          { unit: "이차방정식과 근의 공식", avgUnderstanding: 2.4, questionCount: 14 },
          { unit: "확률의 독립과 종속", avgUnderstanding: 2.8, questionCount: 9 },
        ]
      : profile === "strong"
        ? [{ unit: "함수의 정의역·치역", avgUnderstanding: 3.4, questionCount: 6 }]
        : profile === "declining"
          ? [
              { unit: "이차방정식과 근의 공식", avgUnderstanding: 2.0, questionCount: 22 },
              { unit: "이차함수의 그래프와 축", avgUnderstanding: 2.6, questionCount: 16 },
            ]
          : [{ unit: "확률의 독립과 종속", avgUnderstanding: 3.1, questionCount: 11 }];

  return {
    studentName: student.name,
    classLabel: student.classLabel,
    period,
    chatLog: log,
    misconceptionTags,
    weakSections,
  };
}
