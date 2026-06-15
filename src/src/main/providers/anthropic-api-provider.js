import { createAnthropic } from "@ai-sdk/anthropic";
import { BaseApiProvider } from "./base-api-provider.js";

const DEFAULT_BASE_URL = "";
const TEST_MODEL_ORDER = ["claude-sonnet-4-0", "claude-sonnet-4-6", "claude-opus-4-6"];

export class AnthropicApiProvider extends BaseApiProvider {
  createModel(participant) {
    return this.client()(participant.modelId);
  }

  testModels() {
    const models = this.config.models || [];
    return [...models].sort((left, right) => this.modelRank(left?.id) - this.modelRank(right?.id));
  }

  client() {
    return createAnthropic({
      apiKey: this.config.api?.apiKey,
      ...(this.baseUrl() ? { baseURL: this.baseUrl() } : {})
    });
  }

  baseUrl() {
    return String(this.config.api?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  healthCheckUrl() {
    const baseUrl = this.baseUrl() || "https://api.anthropic.com/v1";
    return `${baseUrl.replace(/\/+$/, "")}/models`;
  }

  healthCheckHeaders(apiKey) {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    };
  }

  modelRank(modelId) {
    const index = TEST_MODEL_ORDER.indexOf(modelId);
    return index < 0 ? TEST_MODEL_ORDER.length : index;
  }
}
