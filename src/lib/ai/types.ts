export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface JsonRequest {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: object;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<string>;
  chatJson(request: JsonRequest): Promise<unknown>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
