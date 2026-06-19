import { NextResponse } from "next/server";
import { analyzeDiagnosis } from "@/lib/diagnosis";
import { getPayloadValidationMessage } from "@/lib/payload-validation";
import type { DiagnosisPayload } from "@/lib/types";

function isPayload(value: unknown): value is DiagnosisPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.studentName === "string" &&
    typeof payload.assignmentTitle === "string" &&
    typeof payload.assignmentBrief === "string" &&
    typeof payload.submission === "string" &&
    typeof payload.aiTrace === "string"
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isPayload(body)) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const validationMessage = getPayloadValidationMessage(body);

  if (validationMessage) {
    return NextResponse.json({ error: validationMessage }, { status: 400 });
  }

  const diagnosis = await analyzeDiagnosis(body);
  return NextResponse.json(diagnosis);
}
