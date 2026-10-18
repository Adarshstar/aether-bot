/**
 * OpenAI-compatible + Google Gemini LLM client for Aether.
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  provider?: "openai" | "gemini";
}

export interface LLMResponse {
  content: string;
  raw?: any;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Shared shape implemented by both LLMClient and FallbackLLMClient */
export interface LLMLike {
  chat(messages: LLMMessage[], overrides?: Partial<LLMClientOptions>): Promise<LLMResponse>;
  complete(system: string, user: string): Promise<string>;
}

export class LLMClient {
  readonly options: Required<Pick<LLMClientOptions, "apiKey" | "baseUrl" | "model" | "temperature" | "maxTokens" | "timeoutMs">> & {
    headers: Record<string, string>;
    provider: "openai" | "gemini";
  };

  constructor(opts: LLMClientOptions) {
    if (!opts.apiKey) throw new Error("Aether AI: apiKey is required");
    const provider = opts.provider ?? (opts.apiKey.startsWith("AQ.") || opts.apiKey.startsWith("AIza") ? "gemini" : "openai");
    const defaultBase =
      provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
    const defaultModel = provider === "gemini" ? "gemini-3.8-flash" : "gpt-4o-mini";
    this.options = {
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? defaultBase,
      model: opts.model ?? defaultModel,
      temperature: opts.temperature ?? 0.4,
      maxTokens: opts.maxTokens ?? 800,
      headers: opts.headers ?? {},
      timeoutMs: opts.timeoutMs ?? 60000,
      provider,
    };
  }

  async chat(messages: LLMMessage[], overrides: Partial<LLMClientOptions> = {}): Promise<LLMResponse> {
    const model = overrides.model ?? this.options.model;
    const temperature = overrides.temperature ?? this.options.temperature;
    const maxTokens = overrides.maxTokens ?? this.options.maxTokens;
    const baseUrl = overrides.baseUrl ?? this.options.baseUrl;
    const apiKey = overrides.apiKey ?? this.options.apiKey;
    const provider = overrides.provider ?? this.options.provider;

    if (baseUrl.includes("generativelanguage.googleapis.com") && baseUrl.includes("generateContent")) {
      return this.geminiNative(messages, { model, temperature, maxTokens, apiKey, baseUrl });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...this.options.headers,
      ...overrides.headers,
    };

    const body = { model, messages, temperature, max_tokens: maxTokens };

    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (provider === "gemini" && res.status >= 400) {
        console.warn(`[LLM] OpenAI-compat failed (${res.status}), trying Gemini native...`);
        return this.geminiNative(messages, { model, temperature, maxTokens, apiKey });
      }
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    const json = await res.json();
    const content =
      json.choices?.[0]?.message?.content ??
      json.choices?.[0]?.text ??
      json.output_text ??
      "";

    return { content: String(content).trim(), raw: json, usage: json.usage };
  }

  private async geminiNative(
    messages: LLMMessage[],
    opts: { model: string; temperature: number; maxTokens: number; apiKey: string; baseUrl?: string }
  ): Promise<LLMResponse> {
    const model = opts.model.replace(/^models\//, "") || "gemini-3.8-flash";
    const url =
      opts.baseUrl && opts.baseUrl.includes("generateContent")
        ? opts.baseUrl
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;

    let system = "";
    const contents: any[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        system += (system ? "\n" : "") + m.content;
        continue;
      }
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    const body: any = {
      contents,
      generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    const json = await res.json();
    const content =
      json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ??
      json.candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    return {
      content: String(content).trim(),
      raw: json,
      usage: json.usageMetadata
        ? {
            prompt_tokens: json.usageMetadata.promptTokenCount,
            completion_tokens: json.usageMetadata.candidatesTokenCount,
            total_tokens: json.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  async complete(system: string, user: string): Promise<string> {
    const r = await this.chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    return r.content;
  }
}
