import { NextResponse } from "next/server";
import { generateExamDraft, generatePriorities } from "@/lib/learning-planner";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = body?.mode === "exam" ? "exam" : "priorities";
  if (mode === "exam") {
    const exam = await generateExamDraft();
    return NextResponse.json(exam);
  }
  const studentName = typeof body?.studentName === "string" && body.studentName ? body.studentName : "민준";
  const priorities = await generatePriorities(studentName);
  return NextResponse.json(priorities);
}
