import { NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parse";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "multipart/form-data 요청이 필요합니다." }, { status: 400 });
  }

  const file = formData.get("file");
  const kind = formData.get("kind");

  if (!(file instanceof File)) {
    // 파일 없이 호출되면 데모용 더미 결과로 응답 (영상 시연 시 키 없는 환경에서도 동작)
    const demoFile = new File([new Uint8Array()], "demo.pdf", { type: "application/pdf" });
    const parsed = await parseDocument(demoFile, kind === "student-photo" ? "student-photo" : "teacher-print");
    return NextResponse.json(parsed);
  }

  const parsed = await parseDocument(file, kind === "student-photo" ? "student-photo" : "teacher-print");
  return NextResponse.json(parsed);
}
