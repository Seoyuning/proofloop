import { NextResponse } from "next/server";
import { generateClassPattern } from "@/lib/class-pattern";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const period = typeof body?.period === "string" && body.period ? body.period : "2026년 1학기 (3월~6월)";
  const report = await generateClassPattern(period);
  return NextResponse.json(report);
}
