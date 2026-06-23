import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDocument } from "@/lib/document-parse";
import { chunkParsedDocument } from "@/lib/rag";
import { embedTexts, isEmbeddingConfigured, toVectorLiteral } from "@/lib/ai/embeddings";

export const maxDuration = 60;

// 교사가 자기 반인지 확인. 맞으면 user를, 아니면 null을 돌려준다.
async function requireClassTeacher(supabase: Awaited<ReturnType<typeof createClient>>, classId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, owns: false };
  const { data } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  return { user, owns: !!data };
}

// GET /api/materials?classId=... — 반의 저장된 학습자료 목록
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  if (!classId) return NextResponse.json({ materials: [] });

  const { data, error } = await supabase
    .from("class_materials")
    .select("id, title, source_kind, page_count, chunk_count, parse_mode, created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ materials: [] });
  return NextResponse.json({ materials: data ?? [] });
}

// POST /api/materials — 파일 업로드 → 파싱 → 청크 → 임베딩 → 저장
export async function POST(request: Request) {
  const supabase = await createClient();

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "multipart/form-data 요청이 필요합니다." }, { status: 400 });
  }

  const file = formData.get("file");
  const classId = (formData.get("classId") as string | null)?.trim();
  const kind = (formData.get("kind") as string | null) ?? "file";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  }
  if (!classId) {
    return NextResponse.json({ error: "반(classId)이 필요합니다." }, { status: 400 });
  }

  const { user, owns } = await requireClassTeacher(supabase, classId);
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  if (!owns) return NextResponse.json({ error: "이 반의 담임 교사만 자료를 추가할 수 있습니다." }, { status: 403 });

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      { error: "임베딩 키(UPSTAGE_API_KEY)가 설정되지 않아 자료 기반 검색을 만들 수 없습니다." },
      { status: 503 },
    );
  }

  // 1) 파싱 (Upstage Document Parse)
  const parsed = await parseDocument(file, "teacher-print");

  // 2) 청크
  const chunks = chunkParsedDocument(parsed);
  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "자료에서 텍스트를 추출하지 못했습니다. 다른 파일/사진으로 시도해 주세요." },
      { status: 422 },
    );
  }

  // 3) 임베딩 (passage)
  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks.map((c) => c.content), "passage");
  } catch (e) {
    console.error("[materials] embedding failed:", e);
    return NextResponse.json({ error: "임베딩 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  // 4) 자료 메타 저장
  const { data: material, error: matErr } = await supabase
    .from("class_materials")
    .insert({
      class_id: classId,
      teacher_id: user.id,
      title: file.name || "학습자료",
      source_kind: kind === "image" ? "image" : "file",
      page_count: parsed.pageCount ?? null,
      chunk_count: chunks.length,
      parse_mode: parsed.mode,
    })
    .select("id, title, source_kind, page_count, chunk_count, parse_mode, created_at")
    .single();

  if (matErr || !material) {
    console.error("[materials] insert material failed:", matErr);
    return NextResponse.json({ error: "자료 저장에 실패했습니다." }, { status: 500 });
  }

  // 5) 청크 + 임베딩 저장 (embedding은 pgvector 리터럴 문자열로)
  const rows = chunks.map((c, i) => ({
    material_id: material.id,
    class_id: classId,
    ordinal: c.ordinal,
    page: c.page,
    content: c.content,
    embedding: toVectorLiteral(vectors[i]),
  }));

  const { error: chunkErr } = await supabase.from("material_chunks").insert(rows);
  if (chunkErr) {
    console.error("[materials] insert chunks failed:", chunkErr);
    // 메타만 남는 걸 방지: 자료 롤백
    await supabase.from("class_materials").delete().eq("id", material.id);
    return NextResponse.json({ error: "자료 색인 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    material,
    chunkCount: chunks.length,
    mode: parsed.mode,
  });
}

// DELETE /api/materials?id=... — 자료 삭제 (청크는 cascade)
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const { error } = await supabase.from("class_materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
