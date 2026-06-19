import { AIProvider, AIProviderError, ChatRequest, JsonRequest } from "../types";

interface OpenAICompatOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  // 모델별 추가 body 파라미터 (예: K-EXAONE의 chat_template_kwargs)
  extraBody?: Record<string, unknown>;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): AIProvider {
  const endpoint = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function call(body: Record<string, unknown>, timeoutMs?: number): Promise<string> {
    const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AIProviderError(
        `${opts.name} HTTP ${res.status}: ${detail.slice(0, 200)}`,
        opts.name,
        res.status,
      );
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new AIProviderError(`${opts.name}: empty response`, opts.name);
    }

    return content;
  }

  return {
    name: opts.name,

    async chat(req: ChatRequest) {
      const messages = [
        { role: "system" as const, content: req.systemPrompt },
        ...req.messages.map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        })),
      ];

      return call(
        {
          model: opts.model,
          messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          ...(opts.extraBody ?? {}),
        },
        req.timeoutMs,
      );
    },

    async chatJson(req: JsonRequest) {
      const messages = [
        { role: "system" as const, content: req.systemPrompt },
        { role: "user" as const, content: req.userPrompt },
      ];

      const text = await call(
        {
          model: opts.model,
          messages,
          temperature: req.temperature ?? 0.2,
          response_format: { type: "json_object" },
          ...(opts.extraBody ?? {}),
        },
        req.timeoutMs,
      );

      return JSON.parse(text);
    },
  };
}
