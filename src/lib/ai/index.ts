import { AIProvider } from "./types";
import { createOpenAICompatProvider } from "./providers/openai-compat";

export type { AIProvider, ChatRequest, ChatMessage, JsonRequest } from "./types";
export { AIProviderError } from "./types";

type ProviderKind = "skt" | "lg-exaone" | "upstage-solar" | "kt-midm";

export type UseCase =
  | "chat"           // 학생 챗봇 일반 대화
  | "diagnosis"      // 진단/평가 (서술형 채점)
  | "long-context"   // 학기 전체 로그 분석 (128K)
  | "planning"       // 커리큘럼·시험 초안 자동 생성
  | "reasoning";     // 수학·과학 풀이 단계별 채점·오답 해설

// use-case별 모델 우선순위. 각 배열의 첫 항목이 1차 기본값이고,
// 그 키가 없으면 다음 순서로 폴백해 가용한 모델을 자동 선택한다.
// (SKT A.X K1은 본선 시작 전 발급이라 chat은 Solar를, planning은 미발급 시 EXAONE을 폴백으로 둔다.)
const FALLBACK_CHAIN: Record<UseCase, ProviderKind[]> = {
  chat:           ["upstage-solar", "lg-exaone", "kt-midm", "skt"],
  diagnosis:      ["lg-exaone",     "upstage-solar", "kt-midm", "skt"],
  "long-context": ["kt-midm",       "lg-exaone", "upstage-solar"],
  planning:       ["skt",           "lg-exaone", "upstage-solar", "kt-midm"],
  reasoning:      ["lg-exaone",     "upstage-solar", "kt-midm", "skt"],
};

interface ProviderEnv {
  kind: ProviderKind;
  apiKey: string;
  baseUrl: string;
  model: string;
  extraBody?: Record<string, unknown>;
}

function envFor(kind: ProviderKind): ProviderEnv | null {
  switch (kind) {
    case "skt": {
      const apiKey = process.env.SKT_API_KEY?.trim();
      if (!apiKey) return null;
      return {
        kind,
        apiKey,
        baseUrl: process.env.SKT_BASE_URL?.trim() || "https://api.platform.a.x/v1",
        model: process.env.SKT_MODEL?.trim() || "ax-k1",
      };
    }
    case "lg-exaone": {
      const apiKey = process.env.FRIENDLI_API_KEY?.trim();
      if (!apiKey) return null;
      return {
        kind,
        apiKey,
        // 대회 공식 가이드: FriendliAI Dedicated Endpoint 사용
        baseUrl: process.env.FRIENDLI_BASE_URL?.trim() || "https://api.friendli.ai/dedicated/v1",
        // Dedicated에서 model은 배포된 Endpoint ID (계정별 고유) — 반드시 FRIENDLI_MODEL로 지정
        model: process.env.FRIENDLI_MODEL?.trim() || "K-EXAONE-236B-A23B",
        // K-EXAONE Controllable Reasoning(default true) → 끄면 빈 응답/지연 방지 + 속도↑
        extraBody: { chat_template_kwargs: { enable_thinking: false } },
      };
    }
    case "upstage-solar": {
      const apiKey = process.env.UPSTAGE_API_KEY?.trim();
      if (!apiKey) return null;
      return {
        kind,
        apiKey,
        baseUrl: process.env.UPSTAGE_BASE_URL?.trim() || "https://api.upstage.ai/v1/solar",
        model: process.env.UPSTAGE_MODEL?.trim() || "solar-pro",
      };
    }
    case "kt-midm": {
      const apiKey = process.env.KT_API_KEY?.trim();
      if (!apiKey) return null;
      return {
        kind,
        apiKey,
        // KT Mi:dm은 EXAONE처럼 FriendliAI Dedicated로 제공(키 flp_, model=Endpoint ID dep...).
        // base는 반드시 /dedicated/v1 (끝의 /v1 없으면 404).
        baseUrl: process.env.KT_BASE_URL?.trim() || "https://api.friendli.ai/dedicated/v1",
        // Dedicated에서 model은 배포된 Endpoint ID — 반드시 KT_MODEL로 지정
        model: process.env.KT_MODEL?.trim() || "K-intelligence/Midm-2.0-Base-Instruct",
      };
    }
    default:
      return null;
  }
}

function build(env: ProviderEnv): AIProvider {
  return createOpenAICompatProvider({
    name: env.kind,
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    model: env.model,
    extraBody: env.extraBody,
  });
}

function resolveExplicit(useCase: UseCase): ProviderKind | null {
  // Per-use-case override env (e.g. AI_PROVIDER_LONG_CONTEXT=kt-midm)
  const envKey = `AI_PROVIDER_${useCase.toUpperCase().replace(/-/g, "_")}`;
  const override = process.env[envKey]?.trim();
  if (override) return override as ProviderKind;

  // Global default
  const global = process.env.AI_PROVIDER?.trim();
  if (global) return global as ProviderKind;

  return null;
}

export function getProvider(useCase: UseCase): AIProvider | null {
  // 1) 명시 override가 있으면 그것만 시도 (키 없으면 null — 의도적 강제)
  const explicit = resolveExplicit(useCase);
  if (explicit) {
    const env = envFor(explicit);
    return env ? build(env) : null;
  }

  // 2) override 없으면 폴백 체인 순회 (1차 기본값 → 대체 모델)
  for (const kind of FALLBACK_CHAIN[useCase]) {
    const env = envFor(kind);
    if (env) return build(env);
  }
  return null;
}

// Backwards-compatible thin wrappers
export function getChatProvider(): AIProvider | null { return getProvider("chat"); }
export function getDiagnosisProvider(): AIProvider | null { return getProvider("diagnosis"); }

// A.X K1 오케스트레이터 — SKT 전용(폴백 없음). 없으면 null → 규칙기반 라우팅으로 폴백.
export function getOrchestratorProvider(): AIProvider | null {
  const env = envFor("skt");
  return env ? build(env) : null;
}

// provider.name(kind) → 사람이 읽는 모델명
export function friendlyModelName(name: string): string {
  switch (name) {
    case "lg-exaone": return "LG EXAONE";
    case "upstage-solar": return "Upstage Solar";
    case "kt-midm": return "KT Mi:dm";
    case "skt": return "SKT A.X K1";
    default: return name;
  }
}
