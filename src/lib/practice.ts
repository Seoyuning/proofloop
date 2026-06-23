// 맞춤 연습문제 공용 타입/헬퍼.

export interface PracticeItem {
  type: string; // 객관식 | 주관식
  question: string;
  choices?: string[];
  answer: string;
  solution: string;
}

// 학생이 풀 때 보는 형태(정답/해설 제거)
export interface PracticeQuestion {
  index: number;
  type: string;
  question: string;
  choices?: string[];
}

export interface GradeResult {
  index: number;
  isCorrect: boolean;
  feedback: string;
  answer: string;
  solution: string;
}

// 반 학년("고1","중3","고등학교 1학년" 등) → problem_bank.grade_key("고1") 정규화
export function normalizeGradeKey(grade: string): string {
  const g = (grade || "").replace(/\s/g, "");
  const lvl = g.includes("초") ? "초" : g.includes("중") ? "중" : g.includes("고") ? "고" : "";
  const num = (g.match(/\d+/) || [""])[0];
  return lvl + num;
}

// 학생에게 보낼 때 정답/해설 숨기기
export function stripAnswers(items: PracticeItem[]): PracticeQuestion[] {
  return items.map((it, index) => ({
    index,
    type: it.type,
    question: it.question,
    ...(it.choices && it.choices.length ? { choices: it.choices } : {}),
  }));
}
