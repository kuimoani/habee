import { aiDisplayName, cryptoId } from "./formatters.js";

export function createBrowserDemoApi() {
  const settingsKey = "habee-demo-settings";
  const conversationsKey = "habee-demo-conversations";
  const defaultSettings = {
    providers: [
      demoProvider("demo-codex", "codex", "Codex Demo", "cli", "codex exec --skip-git-repo-check {{prompt}}", "openai", "codex-demo"),
      demoProvider("demo-claude", "claude", "Claude Demo", "cli", "claude -p {{prompt}}", "anthropic", "claude-demo")
    ]
  };

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  return {
    async getState() {
      return {
        settings: read(settingsKey, defaultSettings),
        conversations: read(conversationsKey, [])
      };
    },
    async saveSettings(settings) {
      write(settingsKey, settings);
      return settings;
    },
    async showSettingsFile() {
      return { ok: true };
    },
    async loadConversation(conversationId) {
      return read(conversationsKey, []).find((item) => item.id === conversationId) || null;
    },
    async saveConversation(conversation) {
      const conversations = read(conversationsKey, []);
      const next = { ...conversation, updatedAt: new Date().toISOString() };
      const index = conversations.findIndex((item) => item.id === next.id);
      if (index >= 0) conversations[index] = next;
      else conversations.unshift(next);
      write(conversationsKey, conversations);
      return next;
    },
    async deleteConversation(conversationId) {
      const next = read(conversationsKey, []).filter((item) => item.id !== conversationId);
      write(conversationsKey, next);
      return next;
    },
    async testProvider(payload) {
      if (payload.providerConfig?.mode !== "api") {
        this.progressCallback?.({
          progressId: payload.progressId,
          type: "terminal-log",
          stream: "stdout",
          providerId: payload.providerConfig?.id,
          displayName: payload.providerConfig?.displayName || "Demo Provider",
          content: "Demo provider is ready.\n",
          createdAt: new Date().toISOString()
        });
      }
      return { ok: true, content: "Demo provider is ready." };
    },
    async evaluateConsensus(payload) {
      const roundCount = payload.conversation?.rounds?.length || 0;
      const participant = reviewerParticipant(payload, read(settingsKey, defaultSettings));
      if (participant) {
        const now = new Date().toISOString();
        this.progressCallback?.({ progressId: payload.progressId, type: "participant-started", roundIndex: roundCount + 1, roundType: "reviewer", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, startedAt: now });
        await wait(250);
        this.progressCallback?.({ progressId: payload.progressId, type: "participant-finished", roundIndex: roundCount + 1, roundType: "reviewer", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, status: "completed", responseMs: 250, completedAt: new Date().toISOString() });
      }
      const agreed = roundCount >= 2;
      return {
        agreed,
        summary: agreed ? "Demo consensus reviewer found that the demo answers have converged." : "",
        finalAnswer: agreed ? "Demo final answer placeholder." : "",
        agreedPoints: agreed ? ["The demo participants share the same recommendation."] : [],
        remainingRisks: [],
        reason: agreed ? "Demo consensus reviewer accepts the agreement after two rounds." : "Demo consensus reviewer suggests one more round.",
        instruction: agreed ? "" : "Compare the prior answers and converge on a single final recommendation."
      };
    },
    async stopAgreement() {
      return { ok: true };
    },
    onAgreementProgress(callback) {
      this.progressCallback = callback;
      return () => {
        this.progressCallback = null;
      };
    },
    async runAgreement(payload) {
      const now = new Date().toISOString();
      const emit = (progress) => this.progressCallback?.({ progressId: payload.progressId, ...progress });
      emit({ type: "round-started", roundIndex: 1, roundType: "initial-answer" });
      for (const participant of payload.participants) {
        emit({ type: "participant-started", roundIndex: 1, roundType: "initial-answer", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, startedAt: now });
      }
      await wait(400);
      const responses = payload.participants.map((participant, index) => {
        emit({ type: "participant-finished", roundIndex: 1, roundType: "initial-answer", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, status: "completed", responseMs: 400, completedAt: new Date().toISOString() });
        return response(participant, `${participant.displayName} demo answer ${index + 1}:\n${payload.prompt}\n\nThis is a simulated answer for UI testing.`, now);
      });
      emit({ type: "run-completed" });
      const conversation = {
        id: `demo-${Date.now()}`,
        title: payload.prompt.slice(0, 42) || "Demo conversation",
        createdAt: now,
        updatedAt: now,
        participants: payload.participants,
        reviewer: payload.reviewer || payload.coordinator || null,
        messages: [{ id: `message-${Date.now()}`, role: "user", content: payload.prompt, createdAt: now }],
        rounds: [{ id: `round-a-${Date.now()}`, index: 1, type: "initial-answer", responses }]
      };
      await this.saveConversation(conversation);
      return conversation;
    },
    async continueAgreement(payload) {
      const now = new Date().toISOString();
      const emit = (progress) => this.progressCallback?.({ progressId: payload.progressId, ...progress });
      const conversation = {
        ...payload.conversation,
        messages: [...(payload.conversation.messages || [])],
        rounds: [...(payload.conversation.rounds || [])]
      };
      const roundIndex = conversation.rounds.length + 1;
      const extraPrompt = String(payload.extraPrompt || "").trim();
      conversation.messages.push({
        id: `message-${Date.now()}`,
        role: "user",
        content: extraPrompt || "No additional prompt.",
        createdAt: now,
        kind: payload.instructionKind || "round-instruction",
        roundIndex,
        reviewer: conversation.reviewer || conversation.coordinator || null
      });
      emit({ type: "round-started", roundIndex, roundType: "review" });
      for (const participant of conversation.participants) {
        emit({ type: "participant-started", roundIndex, roundType: "review", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, startedAt: now });
      }
      await wait(400);
      const responses = conversation.participants.map((participant, index) => {
        emit({ type: "participant-finished", roundIndex, roundType: "review", participantId: participant.id, providerId: participant.providerConfigId, displayName: participant.displayName, status: "completed", responseMs: 400, completedAt: new Date().toISOString() });
        return response(participant, `## ${participant.displayName} demo review ${index + 1}\n\nThis review compares prior answers and recommends the strongest final opinion.`, now);
      });
      conversation.rounds.push({ id: `round-${Date.now()}`, index: roundIndex, type: "review", responses });
      conversation.updatedAt = now;
      emit({ type: "run-completed" });
      await this.saveConversation(conversation);
      return conversation;
    }
  };
}

function demoProvider(id, provider, displayName, mode, commandLine, apiProvider, modelId) {
  return {
    id,
    provider,
    displayName,
    mode,
    enabled: true,
    timeoutMs: 120000,
    cli: { commandLine },
    api: { provider: apiProvider, apiKey: "", baseUrl: "" },
    models: [{ id: modelId, displayName }]
  };
}

function availableDemoParticipants(settings) {
  return (settings.providers || [])
    .filter((provider) => provider.enabled !== false)
    .flatMap((provider) => (provider.models || []).map((model) => ({
      key: `${provider.id}:${model.id}`,
      id: cryptoId(`${provider.id}:${model.id}`),
      providerConfigId: provider.id,
      modelId: model.id,
      providerName: provider.displayName || provider.id,
      modelName: model.displayName || model.id,
      baseName: aiDisplayName(model.displayName || model.id, provider.displayName || provider.id),
      displayName: aiDisplayName(model.displayName || model.id, provider.displayName || provider.id)
    })));
}

function reviewerParticipant(payload, settings) {
  const participantKey = payload.conversation?.reviewer?.participantKey || payload.conversation?.coordinator?.participantKey;
  const participants = [
    ...(payload.conversation?.participants || []),
    ...availableDemoParticipants(settings)
  ];
  return participants.find((item) => item.key === participantKey || `${item.providerConfigId}:${item.modelId}` === participantKey)
    || payload.conversation?.participants?.[0];
}

function response(participant, content, startedAt) {
  return {
    participantId: participant.id,
    status: "completed",
    content,
    usage: null,
    responseMs: 400,
    error: null,
    startedAt,
    completedAt: new Date().toISOString()
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
