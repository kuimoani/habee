export const providerPresets = [
  {
    id: "codex-cli",
    label: "OpenAI Codex CLI",
    group: "CLI",
    provider: "codex",
    mode: "cli",
    displayName: "Codex CLI",
    commandLine: "codex exec --skip-git-repo-check {{prompt}}",
    apiProvider: "openai",
    baseUrl: "",
    setupText: "Install OpenAI Codex CLI, then sign in from your local terminal before using this provider.",
    setupUrl: "https://developers.openai.com/codex/cli/",
    models: ["gpt-5.1-codex", "gpt-5-codex", "gpt-5-mini"]
  },
  {
    id: "claude-cli",
    label: "Claude CLI",
    group: "CLI",
    provider: "claude",
    mode: "cli",
    displayName: "Claude CLI",
    commandLine: "claude -p {{prompt}}",
    apiProvider: "anthropic",
    baseUrl: "",
    setupText: "Install Claude Code CLI, then authenticate it locally before using this provider.",
    setupUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-sonnet-4-0"]
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    group: "CLI",
    provider: "gemini",
    mode: "cli",
    displayName: "Gemini CLI",
    commandLine: "gemini -p {{prompt}}",
    apiProvider: "openai",
    baseUrl: "",
    setupText: "Install Gemini CLI and complete local authentication before using this provider.",
    setupUrl: "https://github.com/google-gemini/gemini-cli",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro"]
  },
  {
    id: "openai-api",
    label: "OpenAI API",
    group: "API",
    provider: "openai",
    mode: "api",
    displayName: "OpenAI API",
    commandLine: "",
    apiProvider: "openai",
    baseUrl: "",
    setupText: "Create an OpenAI API key and paste it below.",
    setupUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-5.1", "gpt-5", "gpt-5-mini"]
  },
  {
    id: "claude-api",
    label: "Claude API",
    group: "API",
    provider: "claude",
    mode: "api",
    displayName: "Claude API",
    commandLine: "",
    apiProvider: "anthropic",
    baseUrl: "",
    setupText: "Create an Anthropic API key and paste it below.",
    setupUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-sonnet-4-0"]
  },
  {
    id: "gemini-api",
    label: "Gemini API",
    group: "API",
    provider: "gemini",
    mode: "api",
    displayName: "Gemini API",
    commandLine: "",
    apiProvider: "google",
    baseUrl: "",
    setupText: "Create a Gemini API key in Google AI Studio and paste it below.",
    setupUrl: "https://aistudio.google.com/app/apikey",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-pro-preview"]
  },
  {
    id: "deepseek-api",
    label: "Deepseek API",
    group: "API",
    provider: "deepseek",
    mode: "api",
    displayName: "Deepseek API",
    commandLine: "",
    apiProvider: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    setupText: "Create a DeepSeek API key and paste it below.",
    setupUrl: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "grok-api",
    label: "Grok API",
    group: "API",
    provider: "grok",
    mode: "api",
    displayName: "Grok API",
    commandLine: "",
    apiProvider: "openai",
    baseUrl: "https://api.x.ai/v1",
    setupText: "Create an xAI API key and paste it below.",
    setupUrl: "https://console.x.ai/",
    models: ["grok-4", "grok-3", "grok-3-mini"]
  }
];

export function providerFromPreset(preset) {
  return {
    id: `${preset.id}-${Date.now()}`,
    presetId: preset.id,
    provider: preset.provider,
    displayName: preset.displayName,
    mode: preset.mode,
    enabled: true,
    timeoutMs: 120000,
    cli: {
      commandLine: preset.commandLine || "",
      cwd: ""
    },
    api: {
      provider: preset.apiProvider,
      apiKey: "",
      baseUrl: preset.baseUrl || ""
    },
    setupText: preset.setupText || "",
    setupUrl: preset.setupUrl || "",
    models: preset.models.map((model) => ({ id: slugify(model), displayName: model }))
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "model";
}
