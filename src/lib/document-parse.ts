/**
 * Upstage Document Parse 어댑터.
 * Upstage DP는 OpenAI 호환이 아닌 별도의 multipart/form-data 업로드 API.
 * Endpoint: https://api.upstage.ai/v1/document-digitization
 */

export interface ParsedElement {
  category: "heading" | "paragraph" | "table" | "equation" | "figure";
  text: string;
  pageNumber?: number;
}

export interface ParsedDocument {
  mode: "live_ai" | "demo_ai";
  modelName: string;
  fileName: string;
  pageCount: number;
  elements: ParsedElement[];
  detectedUnits: string[];
  detectedConcepts: string[];
  summary: string;
}

const FALLBACK_TEACHER_PRINT: ParsedDocument = {
  mode: "demo_ai",
  modelName: "heuristic-fallback",
  fileName: "중3수학_3단원_연습문제.pdf",
  pageCount: 4,
  elements: [
    { category: "heading", text: "3단원. 이차함수와 그래프", pageNumber: 1 },
    { category: "paragraph", text: "이차함수 y = ax² + bx + c 의 표준형은 y = a(x - p)² + q 이다.", pageNumber: 1 },
    { category: "equation", text: "y = a(x - p)² + q,  꼭짓점 (p, q)", pageNumber: 1 },
    { category: "table", text: "표 3-1: 표준형↔일반형 변환 예제\n| 표준형 | 일반형 |\n|---|---|\n| y = 2(x-1)² + 3 | y = 2x² - 4x + 5 |", pageNumber: 2 },
    { category: "paragraph", text: "연습문제 1. 다음 이차함수의 꼭짓점 좌표를 구하시오. y = (x-3)² - 2", pageNumber: 3 },
    { category: "equation", text: "판별식 D = b² - 4ac", pageNumber: 4 },
    { category: "paragraph", text: "D > 0: 서로 다른 두 실근 / D = 0: 중근 / D < 0: 허근", pageNumber: 4 },
  ],
  detectedUnits: ["이차함수의 그래프와 축", "이차방정식과 근의 공식"],
  detectedConcepts: ["표준형", "꼭짓점", "판별식", "허근"],
  summary: "이차함수 표준형 변환과 꼭짓점, 이차방정식 판별식·허근 개념을 다룬 4페이지 분량 연습문제. 이미 챗봇 기준 데이터에 추가됨.",
};

const FALLBACK_STUDENT_PHOTO: ParsedDocument = {
  mode: "demo_ai",
  modelName: "heuristic-fallback",
  fileName: "수학_문제_사진.jpg",
  pageCount: 1,
  elements: [
    { category: "heading", text: "[중3 수학 - 이차함수 응용 문제]", pageNumber: 1 },
    { category: "equation", text: "y = -2(x + 1)² + 5", pageNumber: 1 },
    { category: "paragraph", text: "(1) 위 이차함수의 꼭짓점 좌표를 구하시오.", pageNumber: 1 },
    { category: "paragraph", text: "(2) 이 함수의 그래프가 위로 볼록인지 아래로 볼록인지 판단하고 이유를 설명하시오.", pageNumber: 1 },
    { category: "paragraph", text: "(3) y절편을 구하시오.", pageNumber: 1 },
  ],
  detectedUnits: ["이차함수의 그래프와 축"],
  detectedConcepts: ["꼭짓점", "볼록 방향", "y절편"],
  summary: "이차함수 표준형이 주어진 응용 문제 사진. 꼭짓점·볼록 방향·y절편을 단계적으로 묻는 구조로, 풀이 가이드는 답을 직접 주지 않고 단계별 자기 설명을 유도합니다.",
};

interface UpstageElement {
  category?: string;
  content?: { html?: string; markdown?: string; text?: string };
  page?: number;
}

interface UpstageResponse {
  elements?: UpstageElement[];
  ocr?: string;
  metadata?: { pages?: number };
}

function categoryFromUpstage(category?: string): ParsedElement["category"] {
  if (!category) return "paragraph";
  const lc = category.toLowerCase();
  if (lc.includes("heading")) return "heading";
  if (lc.includes("table")) return "table";
  if (lc.includes("equation") || lc.includes("formula")) return "equation";
  if (lc.includes("figure") || lc.includes("image")) return "figure";
  return "paragraph";
}

export async function parseDocument(file: File, kind: "teacher-print" | "student-photo"): Promise<ParsedDocument> {
  const fallback = kind === "teacher-print" ? FALLBACK_TEACHER_PRINT : FALLBACK_STUDENT_PHOTO;
  const fallbackWithName: ParsedDocument = { ...fallback, fileName: file.name || fallback.fileName };

  const apiKey = process.env.UPSTAGE_API_KEY?.trim();
  if (!apiKey) return fallbackWithName;

  const formData = new FormData();
  formData.append("document", file);
  formData.append("model", "document-parse");

  try {
    const res = await fetch("https://api.upstage.ai/v1/document-digitization", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      console.error(`[document-parse] HTTP ${res.status}`);
      return fallbackWithName;
    }

    const data = (await res.json()) as UpstageResponse;
    const elements: ParsedElement[] = (data.elements ?? []).map((e) => ({
      category: categoryFromUpstage(e.category),
      text: e.content?.markdown || e.content?.text || e.content?.html || "",
      pageNumber: e.page,
    })).filter((e) => e.text.trim().length > 0);

    return {
      mode: "live_ai",
      modelName: "upstage-document-parse",
      fileName: file.name,
      pageCount: data.metadata?.pages ?? Math.max(...elements.map((e) => e.pageNumber ?? 1), 1),
      elements,
      detectedUnits: [],
      detectedConcepts: [],
      summary: `Upstage Document Parse가 ${elements.length}개 요소를 추출했습니다.`,
    };
  } catch (err) {
    console.error("[document-parse] failed:", err);
    return fallbackWithName;
  }
}
