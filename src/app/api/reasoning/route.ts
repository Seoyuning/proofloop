import { NextResponse } from "next/server";
import { gradeSolution } from "@/lib/reasoning-grader";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.question || !body?.studentSolution) {
    return NextResponse.json({ error: "question과 studentSolution이 필요합니다." }, { status: 400 });
  }
  const grading = await gradeSolution(body.question, body.studentSolution);
  return NextResponse.json(grading);
}
