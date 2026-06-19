import { NextResponse } from "next/server";
import { generateSemesterReport } from "@/lib/semester-report";
import { buildFixtureInput, FIXTURE_STUDENTS } from "@/lib/semester-report-fixture";

export async function GET() {
  return NextResponse.json({ students: FIXTURE_STUDENTS });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.studentId !== "string") {
    return NextResponse.json({ error: "studentId가 필요합니다." }, { status: 400 });
  }

  const period = typeof body.period === "string" && body.period ? body.period : "2026년 1학기 (3월~6월)";
  const input = buildFixtureInput(body.studentId, period);
  const report = await generateSemesterReport(input);

  return NextResponse.json(report);
}
