import crypto from "node:crypto";
import { createProvider } from "./factory.js";
import { rawErrorMessage, throwIfAborted } from "./base-provider.js";

export class ProviderRegistry {
  async runAgreement(payload, options = {}) {
    const now = new Date().toISOString();
    const onProgress = options.onProgress || (() => {});
    const conversation = {
      id: payload.conversationId || crypto.randomUUID(),
      title: makeTitle(payload.prompt),
      createdAt: payload.createdAt || now,
      updatedAt: now,
      participants: payload.participants,
      coordinator: payload.coordinator || { mode: "user", participantKey: "" },
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: payload.prompt,
          createdAt: now
        }
      ],
      rounds: [],
      summaries: [],
      userSelectedResult: null
    };

    onProgress({
      type: "run-started",
      conversationId: conversation.id,
      participants: payload.participants,
      createdAt: now
    });

    const initialRound = await this.runRound({
      type: "initial-answer",
      index: 1,
      prompt: payload.prompt,
      participants: payload.participants,
      settings: payload.settings,
      onProgress,
      signal: options.signal
    });
    conversation.rounds.push(initialRound);

    onProgress({
      type: "run-completed",
      conversationId: conversation.id,
      completedAt: new Date().toISOString()
    });

    return conversation;
  }

  async continueAgreement(payload, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const now = new Date().toISOString();
    const conversation = {
      ...payload.conversation,
      messages: [...(payload.conversation.messages || [])],
      rounds: [...(payload.conversation.rounds || [])]
    };
    const index = conversation.rounds.length + 1;
    const originalPrompt = conversation.messages.find((message) => message.role === "user")?.content || "";
    const extraPrompt = String(payload.extraPrompt || "").trim();

    conversation.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: extraPrompt || "No additional prompt.",
      createdAt: now,
      kind: payload.instructionKind || "round-instruction",
      roundIndex: index,
      coordinator: conversation.coordinator || null
    });

    throwIfAborted(options.signal);
    const reviewPrompt = buildReviewPrompt(originalPrompt, conversation.rounds, extraPrompt, conversation.participants);
    const round = await this.runRound({
      type: "review",
      index,
      prompt: reviewPrompt,
      participants: conversation.participants,
      settings: payload.settings,
      onProgress,
      signal: options.signal
    });
    conversation.rounds.push(round);
    conversation.summaries = round.responses.map((response) => ({
      id: crypto.randomUUID(),
      participantId: response.participantId,
      content: response.content || response.error || "",
      createdAt: response.completedAt || new Date().toISOString()
    }));
    conversation.updatedAt = new Date().toISOString();

    onProgress({
      type: "run-completed",
      conversationId: conversation.id,
      completedAt: new Date().toISOString()
    });

    return conversation;
  }

  async evaluateConsensus(payload, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const coordinator = buildCoordinatorParticipant(payload.conversation?.coordinator, payload.settings);
    if (!coordinator) {
      return {
        agreed: false,
        instruction: "Continue the discussion and work toward a shared answer.",
        reason: "Coordinator model was not found."
      };
    }

    const startedAt = new Date().toISOString();
    onProgress({
      type: "participant-started",
      roundType: "coordinator",
      roundIndex: (payload.conversation?.rounds || []).length + 1,
      participantId: coordinator.id,
      providerId: coordinator.providerConfigId,
      displayName: coordinator.displayName,
      startedAt
    });

    const response = await this.callParticipant(
      coordinator,
      buildConsensusPrompt(payload.conversation),
      payload.settings,
      { onProgress, participant: coordinator, signal: options.signal }
    );

    onProgress({
      type: "participant-finished",
      roundType: "coordinator",
      roundIndex: (payload.conversation?.rounds || []).length + 1,
      participantId: coordinator.id,
      providerId: coordinator.providerConfigId,
      displayName: coordinator.displayName,
      status: response.status,
      error: response.error,
      responseMs: response.responseMs,
      completedAt: response.completedAt
    });

    if (response.status !== "completed") {
      return {
        agreed: false,
        instruction: "Continue the discussion and explicitly address the unresolved disagreements.",
        reason: response.error,
        rawContent: response.error
      };
    }

    return {
      ...parseConsensusDecision(response.content),
      rawContent: response.content
    };
  }

  async runRound({ type, index, prompt, participants, settings, onProgress, signal }) {
    const roundId = crypto.randomUUID();
    throwIfAborted(signal);

    onProgress({
      type: "round-started",
      roundId,
      roundType: type,
      roundIndex: index,
      startedAt: new Date().toISOString()
    });

    const responses = await Promise.all(
      participants.map((participant) => {
        onProgress({
          type: "participant-started",
          roundId,
          roundType: type,
          roundIndex: index,
          participantId: participant.id,
          providerId: participant.providerConfigId,
          displayName: participant.displayName,
          startedAt: new Date().toISOString()
        });

        return this.callParticipant(participant, prompt, settings, { onProgress, participant, signal })
          .then((response) => {
            onProgress({
              type: "participant-finished",
              roundId,
              roundType: type,
              roundIndex: index,
              participantId: participant.id,
              providerId: participant.providerConfigId,
              displayName: participant.displayName,
              status: response.status,
              error: response.error,
              usage: response.usage,
              responseMs: response.responseMs,
              completedAt: response.completedAt
            });
            return response;
          });
      })
    );

    onProgress({
      type: "round-completed",
      roundId,
      roundType: type,
      roundIndex: index,
      completedAt: new Date().toISOString()
    });

    return {
      id: roundId,
      index,
      type,
      prompt,
      responses
    };
  }

  async callParticipant(participant, prompt, settings, options = {}) {
    const providerConfig = settings.providers.find((item) => item.id === participant.providerConfigId);
    const startedAt = new Date().toISOString();

    if (options.signal?.aborted) {
      return failedResponse(participant.id, startedAt, "aborted");
    }

    if (!providerConfig) {
      return failedResponse(participant.id, startedAt, "Provider configuration was not found.");
    }

    try {
      const content = await createProvider(providerConfig).call(participant, prompt, { ...options, participant });
      return {
        participantId: participant.id,
        status: "completed",
        content: content.text,
        usage: content.usage,
        responseMs: Date.now() - new Date(startedAt).getTime(),
        error: null,
        startedAt,
        completedAt: new Date().toISOString()
      };
    } catch (error) {
      return failedResponse(participant.id, startedAt, rawErrorMessage(error));
    }
  }

  async testProvider(providerConfig, options = {}) {
    const prompt = "Reply with a short confirmation that this provider is working.";
    const provider = createProvider(providerConfig);
    const models = provider.testModels();
    const errors = [];

    for (const model of models) {
      const participant = {
        id: `test-${providerConfig.id}-${model?.id || "default"}`,
        providerConfigId: providerConfig.id,
        modelId: model?.id,
        displayName: model?.displayName || providerConfig.displayName
      };
      try {
        const content = await provider.call(participant, prompt, { ...options, participant });
        return {
          ok: true,
          content: `${participant.modelId}: ${content.text}`,
          usage: content.usage
        };
      } catch (error) {
        errors.push([
          `----- ${participant.modelId || "default"} -----`,
          rawErrorMessage(error)
        ].join("\n"));
      }
    }

    return { ok: false, error: errors.join("\n") || "No models are configured for this provider." };
  }
}

function failedResponse(participantId, startedAt, error) {
  return {
    participantId,
    status: "failed",
    content: "",
    usage: null,
    responseMs: Date.now() - new Date(startedAt).getTime(),
    error,
    startedAt,
    completedAt: new Date().toISOString()
  };
}

function buildReviewPrompt(userPrompt, rounds, extraPrompt, participants = []) {
  const participantNames = new Map(participants.map((participant) => [
    participant.id,
    participantLabel(participant)
  ]));
  const answers = rounds.map((round) => {
    const responses = round.responses.map((response) => {
      const body = response.status === "completed" ? response.content : `ERROR: ${response.error}`;
      const name = participantNames.get(response.participantId) || shortModelName(response.participantId);
      return `${name}:\n${body}`;
    }).join("\n\n---\n\n");
    return `Round ${round.index} (${round.type}):\n${answersHeader(responses)}`;
  }).join("\n\n====================\n\n");

  return [
    "You are participating in a multi-AI agreement discussion.",
    "Participant names may be referenced by full label, short label, or letter alias.",
    participantLegend(participants),
    "",
    "Review the original user request and every prior answer below.",
    "Summarize your view, identify the strongest answer, point out any risks or errors, and suggest the best final answer.",
    "",
    `Original request:\n${userPrompt}`,
    "",
    extraPrompt ? `Additional user instruction for this round:\n${extraPrompt}` : "",
    "",
    answers
  ].join("\n");
}

function answersHeader(responses) {
  return responses || "No prior responses.";
}

function buildCoordinatorParticipant(coordinator, settings) {
  if (!coordinator || coordinator.mode !== "ai" || !coordinator.participantKey) return null;
  const [providerConfigId, ...modelParts] = String(coordinator.participantKey).split(":");
  const modelId = modelParts.join(":");
  const providerConfig = settings.providers.find((provider) => provider.id === providerConfigId);
  if (!providerConfig || !modelId) return null;
  const model = (providerConfig.models || []).find((item) => item.id === modelId);
  return {
    id: participantId(`${providerConfigId}:${modelId}`),
    providerConfigId,
    provider: providerConfig.provider,
    mode: providerConfig.mode,
    modelId,
    providerName: providerConfig.displayName || providerConfig.id,
    modelName: model?.displayName || modelId,
    baseName: aiDisplayName(model?.displayName || modelId, providerConfig.displayName || providerConfig.id),
    displayName: coordinator.displayName || aiDisplayName(model?.displayName || modelId, providerConfig.displayName || providerConfig.id)
  };
}

function buildConsensusPrompt(conversation) {
  const participantNames = new Map((conversation.participants || []).map((participant) => [
    participant.id,
    participantLabel(participant)
  ]));
  const originalPrompt = (conversation.messages || []).find((message) => message.role === "user")?.content || "";
  const rounds = (conversation.rounds || []).map((round) => {
    const responses = (round.responses || []).map((response) => {
      const name = participantNames.get(response.participantId) || shortModelName(response.participantId);
      const body = response.status === "completed" ? response.content : `ERROR: ${response.error}`;
      return `${name}:\n${body}`;
    }).join("\n\n---\n\n");
    return `Round ${round.index} (${round.type}):\n${responses}`;
  }).join("\n\n====================\n\n");

  return [
    "You are the coordinator for a multi-AI agreement process.",
    "Participant names may be referenced by full label, short label, or letter alias.",
    participantLegend(conversation.participants || []),
    "",
    "Decide whether all participating AIs have substantially converged on the same final answer.",
    "Return JSON only, with this exact shape:",
    "{\"agreed\": true|false, \"summary\": \"how the agreement was reached\", \"finalAnswer\": \"the agreed final answer when agreed is true\", \"agreedPoints\": [\"point\"], \"remainingRisks\": [\"risk\"], \"reason\": \"short reason\", \"instruction\": \"next-round instruction if agreed is false\"}",
    "Set agreed to true only when the participants no longer have meaningful disagreements or unresolved risks.",
    "When agreed is true, finalAnswer and summary are required and must explain the substance of the agreement.",
    "If agreed is false, write a concise instruction that will help the participants resolve the remaining disagreement in the next round.",
    "",
    `Original user request:\n${originalPrompt}`,
    "",
    rounds
  ].join("\n");
}

function parseConsensusDecision(content) {
  const text = String(content || "").trim();
  const jsonText = extractJsonObject(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      return {
        agreed: Boolean(parsed.agreed),
        summary: String(parsed.summary || "").trim(),
        finalAnswer: String(parsed.finalAnswer || "").trim(),
        agreedPoints: normalizeStringArray(parsed.agreedPoints),
        remainingRisks: normalizeStringArray(parsed.remainingRisks),
        reason: String(parsed.reason || "").trim(),
        instruction: String(parsed.instruction || "").trim()
      };
    } catch {
      // Fall through to text heuristics.
    }
  }

  const agreed = /\b(agreed|consensus reached|agreement reached)\b/i.test(text)
    && !/\b(not agreed|no consensus|continue|disagreement)\b/i.test(text);
  return {
    agreed,
    summary: text.slice(0, 500),
    finalAnswer: agreed ? text : "",
    agreedPoints: [],
    remainingRisks: [],
    reason: text.slice(0, 240),
    instruction: agreed ? "" : text || "Continue the discussion and resolve the remaining disagreement."
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return candidate.slice(start, end + 1);
}

function participantId(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return `participant-${Math.abs(hash)}`;
}

function participantLegend(participants = []) {
  if (!participants.length) return "Participants: none.";
  const lines = participants.map((participant) => {
    const label = participantLabel(participant);
    const short = participant.shortName || (participant.alias && participant.modelName ? `${participant.alias}. ${participant.modelName}` : "");
    const alias = participant.alias || "";
    const aliases = [short, alias].filter(Boolean).join(", ");
    return aliases ? `- ${label} (also: ${aliases})` : `- ${label}`;
  });
  return ["Participants:", ...lines].join("\n");
}

function participantLabel(participant) {
  if (!participant) return "Unknown participant";
  if (participant.displayName) return participant.displayName;
  if (participant.alias && participant.baseName) return `${participant.alias}. ${participant.baseName}`;
  if (participant.baseName) return participant.baseName;
  if (participant.modelName && participant.providerName) return aiDisplayName(participant.modelName, participant.providerName);
  return shortModelName(participant.modelId || participant.id);
}

function aiDisplayName(modelName, providerName) {
  return `${modelName}(${providerName})`;
}

function shortModelName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown model";
  return normalized.split("/").map((part) => part.trim()).filter(Boolean).at(-1) || normalized;
}

function makeTitle(prompt) {
  const normalized = String(prompt || "New conversation").replace(/\s+/g, " ").trim();
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}
