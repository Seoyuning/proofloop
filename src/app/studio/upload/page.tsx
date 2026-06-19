"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SectionHeader } from "@/components/studio-ui";
import type { ParsedDocument } from "@/lib/document-parse";

type UploadKind = "teacher-print" | "student-photo";

function categoryBadge(c: ParsedDocument["elements"][number]["category"]) {
  const map: Record<typeof c, { label: string; cls: string }> = {
    heading: { label: "제목", cls: "bg-navy text-white" },
    paragraph: { label: "문단", cls: "bg-line text-foreground" },
    table: { label: "표", cls: "bg-orange/15 text-orange" },
    equation: { label: "수식", cls: "bg-teal/15 text-teal" },
    figure: { label: "그림", cls: "bg-amber/20 text-amber" },
  } as const;
  return map[c];
}

export default function UploadPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [kind, setKind] = useState<UploadKind>("teacher-print");
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/studio/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "student") setKind("student-photo");
  }, [user?.role]);

  if (isLoading || !user) return null;

  async function handleUpload(file?: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      if (file) fd.append("file", file);
      const res = await fetch("/api/document-parse", { method: "POST", body: fd });
      setParsed(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <header className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">문서 파싱</span>
          <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">Upstage Document Parse</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-navy sm:text-3xl">
          {kind === "teacher-print" ? "교사 프린트물 업로드" : "문제 사진 풀이"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          {kind === "teacher-print"
            ? "교사가 직접 만든 학습지 PDF를 올리면 표·수식까지 정확히 추출해 챗봇 기준 데이터에 자동 편입합니다."
            : "책 또는 시험지의 문제 사진을 찍어 올리면 OCR로 문제를 추출하고 풀이 가이드를 생성합니다."}
        </p>
      </header>

      <section className="app-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setKind("teacher-print")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              kind === "teacher-print" ? "bg-navy text-white" : "border border-line bg-white text-muted"
            }`}
          >
            교사 프린트물 (PDF)
          </button>
          <button
            type="button"
            onClick={() => setKind("student-photo")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              kind === "student-photo" ? "bg-navy text-white" : "border border-line bg-white text-muted"
            }`}
          >
            학생 문제 사진
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-[20px] border-2 border-dashed border-line bg-surface-strong p-6 text-center transition-colors hover:border-teal disabled:opacity-60"
          >
            <p className="text-3xl">{kind === "teacher-print" ? "📄" : "📸"}</p>
            <p className="mt-2 text-sm font-semibold text-navy">
              {kind === "teacher-print" ? "PDF / Office 파일 선택" : "사진 촬영 또는 선택"}
            </p>
            <p className="mt-1 text-xs text-muted">최대 50MB · {kind === "teacher-print" ? "PDF, DOCX, PPTX 등" : "JPG, PNG, HEIC"}</p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={kind === "teacher-print" ? ".pdf,.docx,.pptx,.xlsx" : "image/*"}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <button
            type="button"
            onClick={() => handleUpload()}
            disabled={busy}
            className="rounded-[20px] border-2 border-dashed border-orange/40 bg-orange/8 p-6 text-center transition-colors hover:border-orange disabled:opacity-60"
          >
            <p className="text-3xl">⚡</p>
            <p className="mt-2 text-sm font-semibold text-navy">시연용 샘플로 즉시 보기</p>
            <p className="mt-1 text-xs text-muted">키 없이도 동작 (휴리스틱 폴백)</p>
          </button>
        </div>
        {busy && <p className="mt-4 text-sm text-muted animate-pulse">Upstage Document Parse로 파싱 중...</p>}
      </section>

      {parsed && (
        <>
          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">파싱 결과</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-navy">{parsed.fileName}</h3>
                <p className="text-sm text-muted">{parsed.pageCount}페이지 · {parsed.elements.length}개 요소 추출</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${parsed.mode === "live_ai" ? "bg-teal/10 text-teal" : "bg-amber/16 text-amber"}`}>
                {parsed.mode === "live_ai" ? `LIVE · ${parsed.modelName}` : "DEMO · 휴리스틱"}
              </span>
            </div>
            <p className="mt-5 leading-7 text-foreground">{parsed.summary}</p>

            {(parsed.detectedUnits.length > 0 || parsed.detectedConcepts.length > 0) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {parsed.detectedUnits.map((u) => (
                  <span key={u} className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">📚 {u}</span>
                ))}
                {parsed.detectedConcepts.map((c) => (
                  <span key={c} className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">💡 {c}</span>
                ))}
              </div>
            )}
          </section>

          <section className="app-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader kicker="추출 요소" title="문서 요소별 분해" copy="제목·문단·표·수식·그림이 카테고리별로 분리됩니다." />
            <div className="mt-5 grid gap-3">
              {parsed.elements.map((el, i) => {
                const badge = categoryBadge(el.category);
                return (
                  <div key={i} className="rounded-[20px] border border-line bg-white p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
                      {el.pageNumber && <span className="text-xs text-muted">p.{el.pageNumber}</span>}
                    </div>
                    <p className={`whitespace-pre-wrap leading-7 ${el.category === "equation" || el.category === "table" ? "font-mono text-sm" : "text-foreground"}`}>
                      {el.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {kind === "teacher-print" && (
            <section className="app-panel rounded-[28px] p-5 sm:p-6">
              <SectionHeader kicker="다음 단계" title="챗봇 기준 데이터로 편입" copy="추출된 표·수식·문단을 그대로 챗봇이 답변 근거로 사용할 수 있습니다." />
              <button
                type="button"
                className="mt-5 rounded-full bg-orange px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                ✓ 이 학습지를 챗봇 기준 데이터에 추가
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
