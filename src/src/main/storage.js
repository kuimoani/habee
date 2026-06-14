import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const openAiModels = [
  { id: "gpt-5.1-codex", displayName: "gpt-5.1-codex" },
  { id: "gpt-5-codex", displayName: "gpt-5-codex" },
  { id: "gpt-5.1", displayName: "gpt-5.1" },
  { id: "gpt-5", displayName: "gpt-5" },
  { id: "gpt-5-mini", displayName: "gpt-5-mini" },
  { id: "gpt-5-nano", displayName: "gpt-5-nano" }
];

const claudeModels = [
  { id: "claude-sonnet-4-6", displayName: "claude-sonnet-4-6" },
  { id: "claude-opus-4-6", displayName: "claude-opus-4-6" },
  { id: "claude-opus-4-5", displayName: "claude-opus-4-5" },
  { id: "claude-sonnet-4-0", displayName: "claude-sonnet-4-0" },
  { id: "claude-opus-4-1", displayName: "claude-opus-4-1" },
  { id: "claude-opus-4-0", displayName: "claude-opus-4-0" }
];

const geminiModels = [
  { id: "gemini-2.5-flash", displayName: "gemini-2.5-flash" },
  { id: "gemini-2.5-flash-lite", displayName: "gemini-2.5-flash-lite" },
  { id: "gemini-2.5-pro", displayName: "gemini-2.5-pro" },
  { id: "gemini-3-pro-preview", displayName: "gemini-3-pro-preview" }
];

const deepseekModels = [
  { id: "deepseek-chat", displayName: "deepseek-chat" },
  { id: "deepseek-reasoner", displayName: "deepseek-reasoner" }
];

const grokModels = [
  { id: "grok-4", displayName: "grok-4" },
  { id: "grok-3", displayName: "grok-3" },
  { id: "grok-3-mini", displayName: "grok-3-mini" }
];

const defaultSettings = {
  coordinator: {
    mode: "user",
    participantKey: ""
  },
  providers: [
    {
      id: "codex-cli",
      provider: "codex",
      displayName: "Codex CLI",
      mode: "cli",
      enabled: true,
      timeoutMs: 120000,
      cli: {
        commandLine: "codex exec --skip-git-repo-check {{prompt}}",
        cwd: ""
      },
      api: {
        provider: "openai",
        apiKey: "",
        baseUrl: ""
      },
      models: openAiModels
    },
    {
      id: "claude-cli",
      provider: "claude",
      displayName: "Claude CLI",
      mode: "cli",
      enabled: true,
      timeoutMs: 120000,
      cli: {
        commandLine: "claude -p {{prompt}}",
        cwd: ""
      },
      api: {
        provider: "anthropic",
        apiKey: "",
        baseUrl: ""
      },
      models: claudeModels
    }
  ]
};

export class JsonStore {
  constructor(userDataPath) {
    this.rootPath = path.join(userDataPath, "habee-data");
    this.conversationPath = path.join(this.rootPath, "conversations");
    this.settingsPath = path.join(this.rootPath, "settings.json");
  }

  async ensureReady() {
    await fs.mkdir(this.conversationPath, { recursive: true });
    try {
      await fs.access(this.settingsPath);
    } catch {
      await this.saveSettings(defaultSettings);
    }
  }

  async getSettings() {
    const settings = await this.readJson(this.settingsPath, defaultSettings);
    return normalizeSettings(settings);
  }

  async saveSettings(settings) {
    const next = normalizeSettings({
      ...settings,
      providers: Array.isArray(settings.providers) ? settings.providers : []
    });
    await this.writeJson(this.settingsPath, next);
    return next;
  }

  async listConversations() {
    const files = await fs.readdir(this.conversationPath);
    const conversations = [];
    for (const file of files.filter((item) => item.endsWith(".json"))) {
      const fullPath = path.join(this.conversationPath, file);
      const conversation = await this.readJson(fullPath, null);
      if (conversation) {
        conversations.push({
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          participants: conversation.participants ?? [],
          userSelectedResult: conversation.userSelectedResult ?? null
        });
      }
    }
    return conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async loadConversation(conversationId) {
    return this.readJson(this.conversationFile(conversationId), null);
  }

  async saveConversation(conversation) {
    const now = new Date().toISOString();
    const next = {
      ...conversation,
      id: conversation.id || crypto.randomUUID(),
      createdAt: conversation.createdAt || now,
      updatedAt: now
    };
    await this.writeJson(this.conversationFile(next.id), next);
    return next;
  }

  async deleteConversation(conversationId) {
    await fs.rm(this.conversationFile(conversationId), { force: true });
  }

  conversationFile(conversationId) {
    return path.join(this.conversationPath, `${conversationId}.json`);
  }

  async readJson(filePath, fallback) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      return fallback;
    }
  }

  async writeJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function normalizeSettings(settings) {
  return {
    ...settings,
    coordinator: settings.coordinator || defaultSettings.coordinator,
    providers: (settings.providers || []).map(normalizeProvider)
  };
}

function normalizeProvider(provider) {
  const inferredProvider = provider.provider || inferProvider(provider);
  const fallbackModels = defaultModelsForProvider(inferredProvider);
  const models = shouldUseDefaultModels(provider.models)
    ? fallbackModels
    : normalizeModelsForProvider(inferredProvider, provider.models);
  const commandLine = provider.cli?.commandLine || joinCommandLine(provider.cli?.command, provider.cli?.argsTemplate);
  const normalized = {
    ...provider,
    provider: inferredProvider,
    timeoutMs: provider.timeoutMs || 120000,
    cli: {
      ...provider.cli,
      commandLine,
      cwd: provider.cli?.cwd || ""
    },
    api: {
      provider: normalizeApiProvider(inferredProvider, provider.api?.provider),
      apiKey: provider.api?.apiKey || "",
      baseUrl: normalizeBaseUrl(inferredProvider, provider.api?.baseUrl || "")
    },
    models
  };

  if (normalized.provider === "codex" && normalized.mode === "cli" && !normalized.cli.commandLine.includes("--skip-git-repo-check")) {
    normalized.cli.commandLine = normalized.cli.commandLine.replace(/^codex\s+exec\s+/, "codex exec --skip-git-repo-check ");
  }

  return normalized;
}

function normalizeBaseUrl(provider, baseUrl) {
  if (provider === "gemini") {
    const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (normalized.endsWith("/openai")) return normalized.slice(0, -"/openai".length);
    if (normalized.endsWith("/chat/completions")) return normalized.slice(0, -"/chat/completions".length).replace(/\/openai$/, "");
    return "";
  }
  if (provider === "deepseek" && baseUrl === "https://api.deepseek.com") {
    return "https://api.deepseek.com/v1";
  }
  return baseUrl;
}

function normalizeApiProvider(provider, apiProvider) {
  if (provider === "gemini") return "google";
  return apiProvider || (provider === "claude" ? "anthropic" : "openai");
}

function inferProvider(provider) {
  const text = `${provider.displayName || ""} ${provider.cli?.commandLine || provider.cli?.command || ""} ${provider.api?.provider || ""}`.toLowerCase();
  if (text.includes("claude") || text.includes("anthropic")) return "claude";
  if (text.includes("gemini") || text.includes("google")) return "gemini";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("grok") || text.includes("x.ai")) return "grok";
  if (text.includes("openai")) return "openai";
  return "codex";
}

function defaultModelsForProvider(provider) {
  if (provider === "claude") return claudeModels;
  if (provider === "gemini") return geminiModels;
  if (provider === "deepseek") return deepseekModels;
  if (provider === "grok") return grokModels;
  return openAiModels;
}

function normalizeModelsForProvider(provider, models) {
  if (provider !== "gemini" || !Array.isArray(models)) return models;
  const priority = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-pro-preview"];
  const normalized = models.map((model) => {
    if (model?.id !== "gemini-3-pro") return model;
    return { ...model, id: "gemini-3-pro-preview", displayName: "gemini-3-pro-preview" };
  });
  return normalized.sort((a, b) => {
    const left = priority.indexOf(a?.id);
    const right = priority.indexOf(b?.id);
    const leftRank = left < 0 ? priority.length : left;
    const rightRank = right < 0 ? priority.length : right;
    return leftRank - rightRank;
  });
}

function joinCommandLine(command, argsTemplate) {
  const args = Array.isArray(argsTemplate) ? argsTemplate : [];
  return [command, ...args].filter(Boolean).join(" ").trim();
}

function shouldUseDefaultModels(models) {
  if (!Array.isArray(models) || models.length === 0) return true;
  if (models.length !== 1) return false;
  return ["codex-default", "claude-sonnet", "default"].includes(models[0]?.id);
}
