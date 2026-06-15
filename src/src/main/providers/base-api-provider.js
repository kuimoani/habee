import { generateText } from "ai";
import { BaseProvider } from "./base-provider.js";

export class BaseApiProvider extends BaseProvider {
  async call(participant, prompt, options = {}) {
    const apiKey = this.config.api?.apiKey;
    if (!apiKey) throw new Error(`API key is empty for ${this.config.displayName || this.config.id}.`);

    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const result = await generateText({
        model: this.createModel(participant),
        prompt,
        abortSignal: controller.signal
      });
      return { text: result.text, usage: result.usage || null };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);
    }
  }

  createModel() {
    throw new Error("API provider model factory is not implemented.");
  }

  async healthCheck() {
    const apiKey = this.config.api?.apiKey;
    if (!apiKey) throw new Error(`API key is empty for ${this.config.displayName || this.config.id}.`);
    const response = await fetchWithTimeout(this.healthCheckUrl(), {
      headers: this.healthCheckHeaders(apiKey)
    }, Math.min(this.timeoutMs(), 30000));
    const text = await response.text();
    if (!response.ok) {
      throw new Error([
        `${response.status} ${response.statusText}`,
        text
      ].filter(Boolean).join("\n"));
    }
    return {
      ok: true,
      content: text || `${this.config.displayName || this.config.id} API key is accepted.`
    };
  }

  healthCheckUrl() {
    const baseUrl = this.baseUrl?.() || "";
    const normalized = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    return `${normalized}/models`;
  }

  healthCheckHeaders(apiKey) {
    return {
      Authorization: `Bearer ${apiKey}`
    };
  }

  testModels() {
    return this.config.models || [];
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
