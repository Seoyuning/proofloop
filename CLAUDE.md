@AGENTS.md

# Project Notes

## Positioning (authoritative)

ProofLoop is a **personalized learning loop**, not a triage tool.

- **Student side**: each student works with a textbook-grounded AI to surface and close the concepts *they personally* are weak on.
- **Teacher side**: the same question database gives the teacher two simultaneous views — (1) per-student weak points and (2) concepts the whole class is commonly stuck on — so individual guidance and whole-class lesson design run on the same signal.
- Avoid copy about "선 볼 학생 고르기", "triage", "3분 점검", "학습 부채 점검 워크벤치" — earlier drafts used this framing and it has been corrected. If you find it anywhere, fix it.

## Active Surface

- `/` — splash landing. Fades in "ProofLoop" title (~1.5s) → fades in a one-line tagline ("학생의 질문이, 교사의 수업이 된다.") → `router.replace("/studio/login")`. Implemented in `src/app/page.tsx` as a client component. Do **not** rebuild the root into a long scrolling marketing page.
- `/studio` is the primary end-user application surface.
- Do not turn `/studio` back into a marketing-style hero page.
- The old `/preview`, `/preview/landing`, `/api/preview`, and `LANDING_PREVIEW_KEY` cookie gate were removed. Do not reintroduce them.

## Current Product Model

The `/studio` route requires email+password authentication (Supabase) with role-based access:

- `/studio/login` — login / signup (email, password, name, role selection). Uses `Suspense` boundary around `useSearchParams()` so production prerender succeeds.
- `/studio` — thin router: as soon as auth state is known, redirects students to `/studio/chat`, teachers to `/studio/analysis`, unauthenticated users to `/studio/login`. **No artificial splash delay here** — previously a 1.35s fade animation gated the redirect and could hang the page if `isLoading` never resolved.
- `/studio/chat` — student-only: textbook chatbot
- `/studio/analysis` — teacher-only: question DB + textbook range analysis
- `/studio/generate` — teacher-only: lesson material / exam draft generation
- `/studio/mypage` — profile (name edit, password change, logout) for both roles

Flow:

1. User hits `/`, sees the splash, lands on `/studio/login`.
2. User signs up with email/password and selects a role (student or teacher). Supabase sends a confirmation email; `/auth/callback/route.ts` exchanges the code for a session and redirects to `/studio`.
3. `/studio` routes students to `/studio/chat` and teachers to `/studio/analysis`.
4. Students ask questions → answers are grounded to the selected textbook, with unit/page evidence. Each student surfaces their own weak concepts through the conversation.
5. The same question data feeds the teacher view, where individual weak points and class-wide common difficulties are shown side by side.
6. Teachers generate lesson-material drafts and exam drafts from the same database at `/studio/generate`.

## Important Files

- `src/app/page.tsx`
  - public splash landing (title → tagline → redirect to `/studio/login`)
- `src/middleware.ts` + `src/lib/supabase/middleware.ts`
  - refreshes Supabase session on every request
- `src/lib/supabase/client.ts` / `server.ts`
  - Supabase SSR client factories; both read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `src/lib/auth-context.tsx`
  - Supabase-backed auth provider. `getSession` and `onAuthStateChange` are wrapped in try/catch/finally so `isLoading` always resolves even on Supabase error.
- `src/lib/studio-context.tsx`
  - shared studio state provider (bot, chat, question DB, teacher outputs)
- `src/app/studio/layout.tsx`
  - studio shell with `AuthProvider` + `StudioProvider` and role-aware sidebar
- `src/app/studio/login/page.tsx`
  - email+password login/signup. Inner form is wrapped in `<Suspense>` so the build's static prerender does not fail on `useSearchParams()`.
- `src/app/studio/page.tsx`
  - thin auth-based router. Shows "이동 중…" while auth is loading, then `router.replace` to the right destination.
- `src/app/studio/chat/page.tsx` — student chatbot page
- `src/app/studio/analysis/page.tsx` — teacher question analysis page
- `src/app/studio/generate/page.tsx` — teacher lesson/exam generation page
- `src/app/studio/mypage/page.tsx` — profile (name, password, logout)
- `src/app/auth/callback/route.ts` — Supabase email confirmation callback
- `src/components/studio-ui.tsx` — shared presentation components for the studio
- `src/lib/studio-data.ts` — seeded textbook, section, and question-cluster data
- `src/lib/studio-generation.ts` — grounded answer and teacher-output generation logic
- `docs/AI_REPORT_DRAFT.md` — hackathon submission report (kept in sync with current positioning; includes the AI-collaboration log in section 2)

## Environment Variables

The deployed Vercel project **must** have these set for all environments (Production / Preview / Development) or Supabase calls throw "Invalid API key" and `/studio` hangs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

국내 5사 모델 키(`FRIENDLI_API_KEY`=LG EXAONE, `UPSTAGE_API_KEY`=Solar, `KT_API_KEY`=Mi:dm, `SKT_API_KEY`=A.X K1, `VARCO_API_KEY`=NC VARCO)는 선택 사항 — 없으면 해당 기능이 휴리스틱 폴백으로 동작한다. **외부 모델(Gemini 등)은 국내 AI 트랙 실격 사유라 코드에서 제거했다. 다시 추가하지 말 것.**

After changing any `NEXT_PUBLIC_*` value you must **redeploy without build cache** — these values are inlined into the JS bundle at build time.

In Supabase → Authentication → URL Configuration, Site URL and the Redirect URLs list must include the production domain plus `/auth/callback`, otherwise the email confirmation link loops back to `/studio/login?error=auth_callback`.

## Styling Notes

- Global CSS uses `word-break: keep-all` + `overflow-wrap: break-word` for Korean. Do **not** change `overflow-wrap` back to `anywhere` — that allows short labels like "로그아웃" to break mid-syllable inside narrow flex containers.
- Short Korean button/pill labels in tight layouts should carry `whitespace-nowrap` as a belt-and-braces measure.

## Working Rules

- Preserve the app-style dashboard UX in `/studio`.
- Keep textbook answers grounded to unit/page evidence.
- Keep the student flow and teacher flow connected through the shared question DB concept — student personalization and teacher aggregation are two views of the same data loop.
- Do not rebuild the root `/` into a multi-section marketing page — it is intentionally a short splash that hands off to `/studio/login`.
- When changing functionality, update `README.md` so the GitHub repository page matches the current product.
- If a task asks for progress documentation, store it under the `report/` directory.
