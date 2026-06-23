/**
 * RAG 보조: 파싱된 문서를 임베딩하기 좋은 청크로 쪼갠다.
 * Document Parse가 추출한 요소(문단/표/수식/제목)를 ~목표 길이로 합쳐
 * 의미 단위 청크를 만들고, 각 청크의 시작 쪽 번호를 함께 보존한다.
 */

import type { ParsedDocument } from "@/lib/document-parse";

export interface MaterialChunk {
  ordinal: number;
  page: number | null;
  content: string;
}

const TARGET = 900; // 청크 목표 글자수
const MAX = 1400; // 단일 요소가 이보다 길면 분할
const MAX_CHUNKS = 250; // 한 자료당 청크 상한(폭주 방지)

function splitLong(text: string): string[] {
  if (text.length <= MAX) return [text];
  const parts: string[] = [];
  // 문장 경계 우선, 안 되면 길이로 자르기
  const sentences = text.split(/(?<=[.!?。])\s+|\n+/);
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length > MAX && buf) {
      parts.push(buf.trim());
      buf = "";
    }
    if (s.length > MAX) {
      for (let i = 0; i < s.length; i += MAX) parts.push(s.slice(i, i + MAX));
    } else {
      buf += (buf ? " " : "") + s;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

export function chunkParsedDocument(parsed: ParsedDocument): MaterialChunk[] {
  const chunks: MaterialChunk[] = [];
  let buf = "";
  let bufPage: number | null = null;

  const flush = () => {
    const content = buf.trim();
    if (content.length >= 12) {
      chunks.push({ ordinal: chunks.length, page: bufPage, content });
    }
    buf = "";
    bufPage = null;
  };

  for (const el of parsed.elements) {
    const text = (el.text ?? "").trim();
    if (!text) continue;

    for (const piece of splitLong(text)) {
      if (bufPage == null) bufPage = el.pageNumber ?? null;
      if ((buf + "\n" + piece).length > TARGET && buf) flush();
      if (bufPage == null) bufPage = el.pageNumber ?? null;
      buf += (buf ? "\n" : "") + piece;
      if (buf.length >= TARGET) flush();
      if (chunks.length >= MAX_CHUNKS) return chunks;
    }
  }
  flush();
  return chunks.slice(0, MAX_CHUNKS);
}
