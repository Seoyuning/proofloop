import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PracticeItem } from "@/lib/practice";

// GET /api/practice/sets?classId=... — 교사용: 반 학생들이 푼 맞춤 연습문제 풀 (이름 등 PII 미포함)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ sets: [] });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  if (!classId) return NextResponse.json({ sets: [] });

  // 교사 본인 반인지 확인
  const { data: cls } = await supabase
    .from("classes").select("id").eq("id", classId).eq("teacher_id", user.id).maybeSingle();
  if (!cls) return NextResponse.json({ sets: [] });

  const { data: rows } = await supabase
    .from("practice_sets")
    .select("id, concept, grade_key, items, created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(20);

  const setIds = (rows ?? []).map((r) => r.id);
  const stats = new Map<string, { attempts: number; correct: number }>();
  if (setIds.length > 0) {
    const { data: attempts } = await supabase
      .from("practice_attempts")
      .select("set_id, is_correct")
      .in("set_id", setIds);
    for (const a of attempts ?? []) {
      const s = stats.get(a.set_id) ?? { attempts: 0, correct: 0 };
      s.attempts += 1;
      if (a.is_correct) s.correct += 1;
      stats.set(a.set_id, s);
    }
  }

  const sets = (rows ?? []).map((r) => ({
    id: r.id,
    concept: r.concept,
    grade_key: r.grade_key,
    created_at: r.created_at,
    items: (r.items ?? []) as PracticeItem[],
    attempts: stats.get(r.id)?.attempts ?? 0,
    correct: stats.get(r.id)?.correct ?? 0,
  }));

  return NextResponse.json({ sets });
}
