import type { ExamDraft, GroundedEvidence } from "@/lib/studio-generation";

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  evidence?: GroundedEvidence[];
  followUp?: string;
  unitLabel?: string;
  understanding?: number | null;
};

export function SectionHeader({
  kicker,
  title,
  copy,
}: {
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <div>
      <p className="eyebrow text-xs text-muted">{kicker}</p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-navy sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">{copy}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-line bg-white/68 p-4">
      <p className="eyebrow text-xs text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-navy">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

export function AsideCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/74">{copy}</p>
    </div>
  );
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\$\\?[a-zA-Z]+\{[^}]*\}\$/g, (m) => {
      return m.replace(/\$/g, "").replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2").replace(/\\[a-zA-Z]+/g, "");
    })
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
    .replace(/\\(cos|sin|tan|log|ln|sqrt|theta|alpha|beta|pi)\b/g, "$1")
    .replace(/\\\\/g, "");
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  // 유저 메시지 — 우측 말풍선
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-navy px-4 py-2.5 text-sm leading-7 text-white">
          {message.text}
        </div>
      </div>
    );
  }

  // AI 메시지 — 아바타 + 플랫 텍스트 (LLM 챗 스타일)
  const displayText = cleanMarkdown(message.text);
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">P</div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">{displayText}</p>

        {message.unitLabel ? (
          <span className="inline-block rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal">{message.unitLabel}</span>
        ) : null}

        {message.evidence && message.evidence.length > 0 ? (
          <div className="grid gap-2">
            {message.evidence.map((evidence) => (
              <div key={`${evidence.unitTitle}-${evidence.pages}`} className="rounded-[16px] border border-line bg-surface-strong p-3">
                <p className="text-sm font-semibold text-navy">📎 {evidence.unitTitle} / {evidence.pages}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted">{evidence.reason}</p>
              </div>
            ))}
          </div>
        ) : null}

        {message.understanding && message.understanding > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-line bg-surface-strong px-3 py-2">
            <p className="text-xs font-semibold text-muted">이해도</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className={`h-2 w-6 rounded-full ${
                    level <= message.understanding!
                      ? message.understanding! >= 4 ? "bg-teal" : message.understanding! >= 3 ? "bg-orange" : "bg-red-400"
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted">
              {message.understanding === 1 ? "매우 부족" : message.understanding === 2 ? "부족" : message.understanding === 3 ? "보통" : message.understanding === 4 ? "양호" : "우수"}
            </span>
          </div>
        ) : null}

        {message.followUp ? (
          <div className="rounded-[16px] border border-teal/16 bg-teal/7 p-3">
            <p className="text-xs font-semibold text-navy">이어서 생각해 볼 질문</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{message.followUp}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface-strong p-3">
      <p className="text-xs font-semibold tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{value}</p>
    </div>
  );
}

export function UnitToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full border px-4 py-2 text-sm transition-all ${
        active ? "border-transparent bg-navy text-white shadow-lg" : "border-line bg-white text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function SimpleListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[24px] border border-line bg-white/68 p-4">
      <p className="text-sm font-semibold text-navy">{title}</p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-current opacity-55" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExamQuestionCard({
  question,
}: {
  question: ExamDraft["questions"][number];
}) {
  const optionLabels = ["A", "B", "C", "D"];

  return (
    <div className="rounded-[24px] border border-line bg-surface-strong p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">문항 {question.number}</p>
          <p className="mt-2 text-base leading-7 text-navy">{question.stem}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-foreground">{question.source}</span>
      </div>

      <div className="mt-4 space-y-2">
        {question.options.map((option, index) => (
          <div key={option} className="rounded-[18px] border border-line bg-white px-3 py-3 text-sm leading-6 text-muted">
            <span className="mr-2 font-semibold text-navy">{optionLabels[index]}.</span>
            {option}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoBlock label="정답" value={question.answer} />
        <InfoBlock label="오답 설계 이유" value={question.rationale} />
      </div>
    </div>
  );
}
