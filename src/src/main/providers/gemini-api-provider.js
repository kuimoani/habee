import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { BaseApiProvider } from "./base-api-provider.js";

const DEFAULT_BASE_URL = "";
const TEST_MODEL_ORDER = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-pro-preview",
  "gemini-flash-latest"
];

export class GeminiApiProvider extends BaseApiProvider {
  createModel(participant) {
    return this.client()(this.normalizeModelId(participant.modelId));
  }

  testModels() {
    const models = this.config.models || [];
    return [...models].sort((left, right) => this.modelRank(left?.id) - this.modelRank(right?.id));
  }

  client() {
    return createGoogleGenerativeAI({
      apiKey: this.config.api?.apiKey,
      ...(this.baseUrl() ? { baseURL: this.baseUrl() } : {})
    });
  }

  baseUrl() {
    return normalizeGeminiBaseUrl(this.config.api?.baseUrl || DEFAULT_BASE_URL);
  }

  modelRank(modelId) {
    const index = TEST_MODEL_ORDER.indexOf(this.normalizeModelId(modelId));
    return index < 0 ? TEST_MODEL_ORDER.length : index;
  }

  normalizeModelId(modelId) {
    if (modelId === "gemini-3-pro") return "gemini-3-pro-preview";
    return modelId;
  }
}

function normalizeGeminiBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (normalized.endsWith("/openai")) {
    return normalized.slice(0, -"/openai".length);
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized.slice(0, -"/chat/completions".length).replace(/\/openai$/, "");
  }
  return normalized;
}
