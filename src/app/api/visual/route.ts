import { NextResponse } from "next/server";
import { generateVisual, type VisualKind } from "@/lib/visual-generator";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const kind: VisualKind = body?.kind === "graph" ? "graph" : body?.kind === "comic" ? "comic" : "diagram";
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : "이차함수 그래프";
  const result = await generateVisual(kind, prompt);
  return NextResponse.json(result);
}
