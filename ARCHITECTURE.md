# ProofLoop — 기술 아키텍처

> 교과서 기반 개인화 학습 루프. 학생은 교과서에 grounding된 AI로 자신의 약점을 스스로 좁히고, 교사는 같은 질문 데이터로 **개인별 약점**과 **반 공통 약점**을 동시에 본다. 학생 개인화와 교사 집계가 **하나의 데이터 루프**의 두 관점이다.

---

## 1. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 배포 | Vercel |
| 인증·DB | Supabase (Auth + Postgres + RLS) |
| 스타일 | Tailwind CSS |
| PWA | Web App Manifest + Service Worker (`public/sw.js`) — 설치형 앱 |
| AI | 국내 5사 모델 (LG·Upstage·KT·SKT·NC) 오케스트레이션 |

---

## 2. 국내 5사 AI 오케스트레이션 (핵심)

외부 모델(Gemini 등)을 일절 쓰지 않고 **국내 5사**만 사용한다. 코드의 모델 선택은 한 곳(`src/lib/ai/`)에 모여 있고, 기능 코드는 "무슨 작업인지(use-case)"만 안다.

### 2-1. 모델별 역할

| 모델 | 진입 | 역할(use-case) | 상태 |
|---|---|---|---|
| **LG EXAONE** (`K-EXAONE-236B-A23B`) | FriendliAI **Dedicated Endpoint** | 채점·진단·추론(reasoning, diagnosis) | ✅ 연결 |
| **Upstage Solar** | Upstage API | 챗봇 대화(chat) + 개념 시각화 내용 생성 | ✅ 연결 |
| **Upstage Document Parse** | Upstage API | 사진 질문 OCR(인쇄·또박또박 손글씨) | ✅ 연결 |
| **KT Mi:dm** | 자체 GPU 호스팅(오픈웨이트) | 장문 맥락 분석(long-context) | ⛔ GPU 호스팅 예정 |
| **SKT A.X K1** | SKT 플랫폼 | **오케스트레이터(라우터)** + 계획 수립(planning) | ⛔ 키 발급 대기 |
| **NC VARCO** | NC API | 시각자료(이미지) 생성 | ⛔ 연동 예정(현재 SVG+LLM로 대체) |

### 2-2. 오케스트레이터 라우팅 (`src/lib/ai/orchestrator.ts`)

학생 챗 입력처럼 **내용이 다양한 진입점**은 SKT A.X K1이 분석해 적절한 모델로 동적 라우팅한다. 목적이 명확한 교사 기능(채점·리포트·생성)은 분류 없이 정책대로 직접 호출한다.

```
학생 질문 ──▶ 오케스트레이터(A.X K1, 미연결 시 규칙기반)
                 │ 내용 분석
                 ├─ 수식·풀이·증명  → reasoning   → LG EXAONE
                 ├─ 개념·일반 질문   → chat        → Upstage Solar
                 └─ 학기·장문 맥락   → long-context → KT Mi:dm
```

- **A.X 미연결 시**: 키워드 규칙기반 분류로 폴백 → 지금도 동적 라우팅 동작, SKT 키 오면 A.X LLM 분류로 자동 격상(graceful).
- 라우팅 판단(라우터/모델/분류 근거)을 응답에 실어 **채팅 UI에 배지로 표시** — "🧭 A.X K1 → LG EXAONE · 수식·풀이 분석".

### 2-3. use-case → 모델 매핑 & 폴백 (`src/lib/ai/index.ts`)

각 use-case는 1순위 모델이 있고, 키가 없으면 폴백 체인을 순회한다. 그래서 KT/SKT 미연결 상태에서도 **EXAONE·Solar로 거의 모든 기능이 라이브로 동작**한다.

| use-case | 1순위 | 폴백 순서 |
|---|---|---|
| chat | Upstage Solar | → EXAONE → Mi:dm → SKT |
| diagnosis / reasoning | LG EXAONE | → Solar → Mi:dm → SKT |
| long-context | KT Mi:dm | → EXAONE → Solar |
| planning | SKT A.X K1 | → EXAONE → Solar → Mi:dm |

### 2-4. 어댑터 & 세부

- **OpenAI 호환 어댑터 하나**(`providers/openai-compat.ts`)로 4사(EXAONE/Solar/Mi:dm/SKT)를 통합 — `baseUrl`·`model`·`apiKey`만 교체.
- **EXAONE Controllable Reasoning**: `chat_template_kwargs.enable_thinking=false`로 추론을 꺼서 빈 응답/지연 방지(속도↑).
- **Graceful degradation**: 모델/키가 없으면 기능마다 휴리스틱 폴백으로 동작하고, 결과에 `mode: "live_ai" | "demo_ai"`를 실어 화면에 라이브/자동생성 여부를 정직하게 표시.

---

## 3. 기능

### 학생
- **교과서 챗봇**(`/studio/chat`): 교과서 단원·쪽수에 grounding된 답변, 오케스트레이터 라우팅, 이해도 평가, 후속 질문. ChatGPT/Claude 스타일 UI.
- **사진으로 질문**: 사진 촬영/선택 → Upstage OCR → 인식 텍스트를 입력창에 넣어 **학생이 확인·수정 후 전송**(손글씨 OCR 오차 보정).
- **수식 기호 툴바**: 모바일에서 ² ³ √ × ÷ 등 빠른 입력.
- **내 약점 리포트**: 본인 질문 데이터 기반 약점 단원(드로어).
- **반 전환 스위처**: 여러 반을 한 곳에서 전환.

### 교사
- **질문 분석 대시보드**(`/studio/analysis`): 실제 학생 데이터 기반 — 학생별 약점, 반 공통 질문 클러스터(단원·오개념 집계), 단원별 이해도.
- **학기 학습 부채 리포트**(`/studio/semester-report`): 학생의 실제 질문 로그 → 주차별 추세·반복 오개념·약점 단원 → EXAONE(long-context) 생성.
- **반 패턴 분석**(`/studio/class-pattern`): 반 공통 오개념·그룹핑.
- **커리큘럼·시험 생성**(`/studio/curriculum`): 우선순위·4주 커리큘럼·변별 시험 초안(planning).
- **개념 시각화**(`/studio/visual`): 아래 참조.

### 개념 시각화 엔진 (`src/lib/visual-generator.ts`)
- **수학 그래프**: 수식 파싱(이차 표준형/일반형·일차·삼차·역수·√·삼각) → SVG 플로터. **x절편·y절편·꼭짓점** 자동 표시, y축 자동 스케일.
- **다이어그램**: 부력/전기회로/광합성은 전용 도해, **그 외 임의 개념은 5사 LLM이 핵심 내용 생성 → 개념맵으로 시각화**(검색하면 진짜 그 개념이 나옴).
- **학습 만화**: LLM 4컷 시나리오.
- VARCO 연동 시 멀티모달 이미지로 격상 예정.

---

## 4. 데이터 모델 (Supabase)

| 테이블 | 용도 |
|---|---|
| `profiles` | 사용자(이름·역할 student/teacher·학년). auth.users 트리거로 자동 생성 |
| `classes` | 반(교사·과목·학년·교과서·학교·초대코드) |
| `class_members` | 반-학생 매핑 |
| `student_questions` | 학생 질문 기록(질문·단원·오개념·이해도) — **분석/리포트의 원천 데이터** |
| `chat_sessions` / `chat_messages` | 채팅 세션·메시지 영속화 |

**RLS**: 본인 데이터 + 교사는 자기 반 학생의 멤버십·질문·**프로필**까지 조회 가능. 학생끼리는 서로 못 봄.

---

## 5. 학습 루프 (한눈에)

```
학생이 질문 ─▶ 오케스트레이터가 5사 중 라우팅 ─▶ 교과서 근거 답변 + 이해도 평가
      │                                                  │
      └──────────── student_questions 에 누적 ◀──────────┘
                          │
        ┌─────────────────┴─────────────────┐
   (학생 관점)                          (교사 관점)
  내 약점 리포트                  학생별 약점 · 반 공통 클러스터 · 학기 리포트
```

같은 데이터가 학생 개인화와 교사 수업 설계를 동시에 굴린다 — 이것이 ProofLoop.
