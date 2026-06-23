/**
 * Upstage 임베딩 어댑터 (국내 5사 — Solar/Document Parse와 같은 UPSTAGE_API_KEY 사용).
 * RAG 검색용: 자료 청크는 'passage', 사용자 질문은 'query'로 임베딩한다.
 * OpenAI 호환 /embeddings 엔드포인트.
 */

const EMBED_URL = process.env.UPSTAGE_EMBED_URL?.trim() || "https://api.upstage.ai/v1/embeddings";
const MODEL_QUERY = process.env.UPSTAGE_EMBED_MODEL_QUERY?.trim() || "embedding-query";
const MODEL_PASSAGE = process.env.UPSTAGE_EMBED_MODEL_PASSAGE?.trim() || "embedding-passage";
const BATCH = 96;

export function isEmbeddingConfigured(): boolean {
  return !!process.env.UPSTAGE_API_KEY?.trim();
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

async function callEmbeddings(model: string, input: string[]): Promise<number[][]> {
  const apiKey = process.env.UPSTAGE_API_KEY?.trim();
  if (!apiKey) throw new Error("UPSTAGE_API_KEY 미설정");

  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upstage embeddings HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  const rows = (data.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding ?? []);

  if (rows.length !== input.length || rows.some((r) => r.length === 0)) {
    throw new Error("Upstage embeddings: 응답 길이/내용 불일치");
  }
  return rows;
}

/** 여러 텍스트를 배치로 임베딩 (자료 적재 시 passage). */
export async function embedTexts(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
  const model = kind === "query" ? MODEL_QUERY : MODEL_PASSAGE;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    out.push(...(await callEmbeddings(model, batch)));
  }
  return out;
}

/** 단일 질문 임베딩 (챗 검색 시). */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await callEmbeddings(MODEL_QUERY, [text]);
  return vec;
}

/** number[] → pgvector 리터럴 "[a,b,c]" (PostgREST text→vector 캐스트가 가장 안전). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
