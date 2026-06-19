import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// GET: list classes (teacher sees own classes, student sees joined classes)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "teacher") {
    const { data, error } = await supabase
      .from("classes")
      .select("*, class_members(count)")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[classes] list error:", error);
      return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ classes: data });
  } else {
    // Student: get joined classes
    const { data: memberships } = await supabase
      .from("class_members")
      .select("class_id, classes(*)")
      .eq("student_id", user.id);

    const classes = memberships?.map((m: any) => m.classes).filter(Boolean) ?? [];
    return NextResponse.json({ classes });
  }
}

// POST: create a class (teacher only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  // Verify teacher role
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher") {
    return NextResponse.json({ error: "교사만 반을 만들 수 있습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.subject || !body?.grade || !body?.publisher || !body?.textbookName) {
    return NextResponse.json({ error: "필수 항목을 모두 입력해 주세요." }, { status: 400 });
  }

  // Generate unique invite code (retry if collision)
  let inviteCode = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase
      .from("classes")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (!existing) break;
    inviteCode = generateInviteCode();
  }

  const { data, error } = await supabase
    .from("classes")
    .insert({
      teacher_id: user.id,
      name: body.name.trim(),
      school: body.school?.trim() || null,
      subject: body.subject.trim(),
      grade: body.grade.trim(),
      publisher: body.publisher.trim(),
      textbook_name: body.textbookName.trim(),
      invite_code: inviteCode,
    })
    .select()
    .single();

  if (error) {
    console.error("[classes] create error:", error);
    return NextResponse.json({ error: "반 생성에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ class: data });
}
