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

  testModels() {
    return this.config.models || [];
  }
}
