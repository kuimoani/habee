import { createOpenAI } from "@ai-sdk/openai";
import { BaseApiProvider } from "./base-api-provider.js";

const DEFAULT_BASE_URL = "";
const TEST_MODEL_ORDER = ["gpt-5-mini", "gpt-5", "gpt-5.1"];

export class OpenAiApiProvider extends BaseApiProvider {
  createModel(participant) {
    return this.client()(participant.modelId);
  }

  testModels() {
    const models = this.config.models || [];
    return [...models].sort((left, right) => this.modelRank(left?.id) - this.modelRank(right?.id));
  }

  client() {
    return createOpenAI({
      apiKey: this.config.api?.apiKey,
      ...(this.baseUrl() ? { baseURL: this.baseUrl() } : {})
    });
  }

  baseUrl() {
    return String(this.config.api?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  modelRank(modelId) {
    const index = TEST_MODEL_ORDER.indexOf(modelId);
    return index < 0 ? TEST_MODEL_ORDER.length : index;
  }
}
