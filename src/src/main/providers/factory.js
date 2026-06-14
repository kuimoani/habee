import { AnthropicApiProvider } from "./anthropic-api-provider.js";
import { ClaudeCliProvider } from "./claude-cli-provider.js";
import { CodexCliProvider } from "./codex-cli-provider.js";
import { DeepSeekApiProvider } from "./deepseek-api-provider.js";
import { GeminiApiProvider } from "./gemini-api-provider.js";
import { GeminiCliProvider } from "./gemini-cli-provider.js";
import { GrokApiProvider } from "./grok-api-provider.js";
import { OpenAiApiProvider } from "./openai-api-provider.js";

const providerClasses = new Map([
  ["api:openai", OpenAiApiProvider],
  ["api:claude", AnthropicApiProvider],
  ["api:gemini", GeminiApiProvider],
  ["api:deepseek", DeepSeekApiProvider],
  ["api:grok", GrokApiProvider],
  ["cli:codex", CodexCliProvider],
  ["cli:claude", ClaudeCliProvider],
  ["cli:gemini", GeminiCliProvider]
]);

export function createProvider(providerConfig) {
  const key = `${providerConfig.mode}:${providerConfig.provider}`;
  const ProviderClass = providerClasses.get(key);
  if (!ProviderClass) {
    throw new Error(`Unsupported provider: ${key}`);
  }
  return new ProviderClass(providerConfig);
}
