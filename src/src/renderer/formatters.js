export function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function rawErrorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message || String(error);
}

export function coordinatorDisplayName(coordinator) {
  if (!coordinator || coordinator.mode !== "ai") return "Manual";
  return coordinator.displayName || "Unknown AI coordinator";
}

export function consensusDetailsFromMessage(message) {
  if (typeof message.agreed === "boolean" || message.reason || message.instruction) {
    return {
      agreed: Boolean(message.agreed),
      summary: message.summary || "",
      finalAnswer: message.finalAnswer || "",
      agreedPoints: Array.isArray(message.agreedPoints) ? message.agreedPoints : [],
      remainingRisks: Array.isArray(message.remainingRisks) ? message.remainingRisks : [],
      reason: message.reason || extractReason(message.content),
      instruction: message.instruction || extractInstruction(message.content)
    };
  }
  const jsonText = extractJsonObject(message.rawContent || message.content);
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
      return null;
    }
  }
  return null;
}

export function formatDuration(ms) {
  if (typeof ms !== "number") return "N/A";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function statusLabel(status) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status || "Unknown";
}

export function roundLabel(index, type) {
  if (type === "coordinator") return "Coordinator / Consensus Check";
  return `Round ${index} / ${type === "initial-answer" ? "Initial Answer" : "Peer Review"}`;
}

export function elapsedLabel(startedAt, completedAt) {
  if (!startedAt) return "Not started";
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return `${seconds}s elapsed`;
}

export function aiDisplayName(modelName, providerName) {
  return `${modelName}(${providerName})`;
}

export function participantAlias(index) {
  let value = "";
  let current = index;
  do {
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return value;
}

export function withParticipantAlias(participant, index) {
  const alias = participantAlias(index);
  const baseName = participant.baseName || participant.displayName;
  const modelName = participant.modelName || baseName;
  return {
    ...participant,
    alias,
    baseName,
    shortName: `${alias}. ${modelName}`,
    displayName: `${alias}. ${baseName}`
  };
}

export function cryptoId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `participant-${Math.abs(hash)}`;
}

function extractJsonObject(value) {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return candidate.slice(start, end + 1);
}

function extractReason(content) {
  const match = String(content || "").match(/Reason:\s*([\s\S]*?)(?:\nNext instruction:|$)/i);
  return match?.[1]?.trim() || "";
}

function extractInstruction(content) {
  const match = String(content || "").match(/Next instruction:\s*([\s\S]*)$/i);
  return match?.[1]?.trim() || "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}
