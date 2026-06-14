import { LitElement, css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "./components/about-dialog.js";
import "./components/provider-log.js";
import { createBrowserDemoApi } from "./demo-api.js";
import {
  aiDisplayName,
  consensusDetailsFromMessage,
  coordinatorDisplayName,
  cryptoId,
  elapsedLabel,
  formatDate,
  formatDuration,
  rawErrorMessage,
  roundLabel,
  statusLabel,
  withParticipantAlias
} from "./formatters.js";
import { renderMarkdown } from "./markdown.js";
import { providerFromPreset, providerPresets } from "./provider-presets.js";
import "./styles.css";

const habeeApi = window.habee || createBrowserDemoApi();

class HabeeApp extends LitElement {
  static properties = {
    settings: { state: true },
    conversations: { state: true },
    activeConversation: { state: true },
    view: { state: true },
    prompt: { state: true },
    selectedParticipantKeys: { state: true },
    isRunning: { state: true },
    statusText: { state: true },
    settingsDraft: { state: true },
    testResults: { state: true },
    runProgress: { state: true },
    progressId: { state: true },
    terminalLogs: { state: true },
    terminalExpanded: { state: true },
    providerTestLogs: { state: true },
    providerTestExpanded: { state: true },
    roundInstruction: { state: true },
    participantToAdd: { state: true },
    coordinatorMode: { state: true },
    coordinatorParticipantKey: { state: true },
    stopRequested: { state: true },
    providerPresetToAdd: { state: true },
    showAbout: { state: true }
  };

  static styles = css``;

  constructor() {
    super();
    this.settings = { providers: [] };
    this.conversations = [];
    this.activeConversation = null;
    this.view = "chat";
    this.prompt = "";
    this.selectedParticipantKeys = [];
    this.isRunning = false;
    this.statusText = "Ready";
    this.settingsDraft = null;
    this.testResults = {};
    this.runProgress = [];
    this.progressId = "";
    this.terminalLogs = [];
    this.terminalExpanded = {};
    this.providerTestLogs = {};
    this.providerTestExpanded = {};
    this.roundInstruction = "";
    this.participantToAdd = "";
    this.coordinatorMode = "user";
    this.coordinatorParticipantKey = "";
    this.stopRequested = false;
    this.providerPresetToAdd = providerPresets[0]?.id || "";
    this.showAbout = false;
    this.unsubscribeProgress = null;
    this.progressTimer = null;
  }

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.unsubscribeProgress = habeeApi.onAgreementProgress?.((progress) => this.handleProgress(progress));
    this.progressTimer = window.setInterval(() => {
      if (this.isRunning) this.requestUpdate();
    }, 1000);
    await this.loadState();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribeProgress?.();
    window.clearInterval(this.progressTimer);
  }

  async loadState() {
    const state = await habeeApi.getState();
    this.settings = state.settings;
    this.settingsDraft = structuredClone(state.settings);
    this.conversations = state.conversations;
  }

  render() {
    return html`
      <main class="shell">
        <aside class="sidebar">
          <a class="brand" @click=${() => this.showAbout = true}>
            <div class="brand-mark">🤝</div>
            <div>
              <strong>Habee</strong>
              <div class="brand-about">AI agreement desk</div>
            </div>
          </a>
          <nav class="nav">
            <button class=${classMap({ active: this.view === "new" })} @click=${this.openNewChat}>+ New Chat</button>
            <button class=${classMap({ active: this.view === "chat" })} @click=${() => this.view = "chat"}>Conversation</button>
            <button class=${classMap({ active: this.view === "settings" })} @click=${this.openSettings}>Settings</button>
          </nav>
          <section class="history">
            <h2>History</h2>
            ${this.conversations.length === 0
              ? html`<p class="muted">No saved conversations yet.</p>`
              : repeat(this.conversations, (item) => item.id, (item) => html`
                <div class="history-item">
                  <button class="history-open" @click=${() => this.loadConversation(item.id)}>
                    <span>${item.title || "Untitled"}</span>
                    <small>${formatDate(item.updatedAt)}</small>
                  </button>
                  <button class="history-delete" title="Delete conversation" @click=${(event) => this.deleteConversation(event, item.id)}>X</button>
                </div>
              `)}
          </section>
        </aside>

        <section class="workspace">
          <header class="topbar">
            <div>
              <h1>${this.pageTitle()}</h1>
              <p>${this.statusText}</p>
            </div>
          </header>

          ${this.view === "settings" ? this.renderSettings() : ""}
          ${this.view === "new" ? this.renderNewChat() : ""}
          ${this.view === "chat" ? this.renderChat() : ""}
        </section>
        ${this.showAbout ? html`<habee-about-dialog @click=${() => this.showAbout = false} @close=${() => this.showAbout = false}></habee-about-dialog>` : ""}
      </main>
    `;
  }

  pageTitle() {
    if (this.view === "settings") return "Settings";
    if (this.view === "new") return "New Chat";
    return this.activeConversation?.title || "Agreement Conversation";
  }

  renderNewChat() {
    const participants = this.availableParticipants();
    const selectedParticipants = this.selectedParticipantKeys
      .map((key) => participants.find((item) => item.key === key))
      .filter(Boolean)
      .map((participant, index) => withParticipantAlias(participant, index));
    return html`
      <section class="panel">
        <div class="section-heading">
          <h2>AI Participants</h2>
          <p>Add one or more models that should participate in the agreement.</p>
        </div>

        ${participants.length === 0 ? html`
            <div class="empty-state">
              <h3>No models configured</h3>
              <p>Add a Codex or Claude provider in Settings first.</p>
            </div>
        ` : html`
          <div class="select-row">
            <select .value=${this.participantToAdd} ?disabled=${this.isRunning} @change=${this.addParticipantFromSelect}>
              <option value="">Select an AI to add</option>
              ${participants.map((item) => html`<option value=${item.key}>${item.displayName}</option>`)}
            </select>
          </div>
          <div class="selected-participants">
            ${selectedParticipants.length === 0 ? html`<p class="muted">No AI participants selected.</p>` : selectedParticipants.map((item) => html`
              <span class="participant-chip">
                <span>${item.displayName}</span>
                <button title="Remove participant" ?disabled=${this.isRunning} @click=${() => this.removeParticipant(item.key)}>X</button>
              </span>
            `)}
          </div>
        `}
      </section>

      <section class="panel">
        <div class="section-heading">
          <h2>Prompt</h2>
          <p>Choose who coordinates this request, then write the prompt.</p>
        </div>
        ${this.renderCoordinatorControl()}
        <label class="prompt-box">
          <span>Prompt</span>
          <div class="prompt-input">
            <textarea
              rows="5"
              placeholder="Enter the request that multiple AIs should answer and review."
              value=${this.prompt}
              @input=${this.updatePrompt}
            ></textarea>
            <button class="primary" ?disabled=${!this.canRun()} @click=${this.runAgreement}>
              Start Agreement
            </button>
          </div>
        </label>
      </section>

      ${this.isRunning ? this.renderRunProgress() : ""}
    `;
  }

  renderCoordinatorControl() {
    const participants = this.availableParticipants();
    return html`
      <div class="coordinator-box">
        <label>
          <span>Coordinator</span>
          <select .value=${this.coordinatorValue()} ?disabled=${this.isRunning} @change=${this.selectCoordinator}>
            <option value="manual">Manual</option>
            ${participants.map((item) => html`<option value=${item.key}>${item.displayName}</option>`)}
          </select>
          <small class="mode-note">${this.coordinatorMode === "ai"
            ? "AI coordinator mode automatically checks for agreement after each round and continues until consensus, a stop request, or the safety round limit."
            : "Manual mode waits for you to decide when to continue each round."}</small>
        </label>
      </div>
    `;
  }

  renderChat() {
    if (!this.activeConversation && !this.isRunning) {
      return html`
        <section class="welcome">
          <h2>Compare multiple AI answers in one place</h2>
          <p>Start a new chat to collect answers, reviews, summaries, and a final user-selected result.</p>
          <button class="primary" @click=${this.openNewChat}>Start New Chat</button>
        </section>
      `;
    }

    if (this.isRunning && !this.activeConversation) {
      return this.renderRunProgress();
    }

    const participants = this.activeConversation.participants || [];
    return html`
      <section class="chat-layout">
        <div class="conversation-strip">
          <div class="section-heading">
            <h2>Participants</h2>
            <p>${participants.map((item, index) => item.displayName || withParticipantAlias(item, index).displayName).join(", ")}</p>
          </div>
        </div>

        ${this.renderConversationFlow()}

        ${this.renderRoundComposer()}
      </section>
    `;
  }

  renderConversationFlow() {
    const messages = this.activeConversation.messages || [];
    const rounds = this.activeConversation.rounds || [];
    const initialMessage = messages.find((message) => message.role === "user" && !message.kind);
    const roundInstructions = messages.filter((message) => ["round-instruction", "coordinator-instruction"].includes(message.kind));
    const coordinatorMessages = messages.filter((message) => message.kind === "coordinator-decision");
    const instructionForRound = (round) => {
      return roundInstructions.find((message) => message.roundIndex === round.index)
        || roundInstructions[round.index - 2];
    };

    return html`
      <div class="conversation-flow">
        ${repeat(rounds, (round) => round.id, (round) => {
          const instruction = instructionForRound(round);
          return html`
          ${round.index === 1 && initialMessage ? this.renderMessageBlock(initialMessage, "User request") : ""}
          ${round.index > 1 && instruction
            ? this.renderMessageBlock(instruction, instruction.kind === "coordinator-instruction" ? "Coordinator instruction" : "User instruction")
            : ""}
          ${this.renderRound(round)}
          ${coordinatorMessages
            .filter((message) => message.roundIndex === round.index)
            .map((message) => this.renderMessageBlock(message, message.agreed ? "Agreement reached" : "Coordinator decision"))}
        `;
        })}
      </div>
    `;
  }

  renderMessageBlock(message, label) {
    const showCoordinator = ["round-instruction", "coordinator-instruction", "coordinator-decision"].includes(message.kind);
    const coordinatorLabel = coordinatorDisplayName(message.coordinator || this.activeConversation?.coordinator);
    return html`
      <article class="message ${message.role}">
        <strong>${label}</strong>
        ${showCoordinator ? html`
          <div class="message-meta">
            <span>Coordinator</span>
            <b>${coordinatorLabel}</b>
          </div>
        ` : ""}
        ${message.kind === "coordinator-decision"
          ? this.renderCoordinatorDecision(message)
          : html`<p>${message.content}</p>`}
      </article>
    `;
  }

  renderCoordinatorDecision(message) {
    const details = consensusDetailsFromMessage(message);
    if (!details) return html`<p>${message.content}</p>`;
    return html`
      <div class="decision-card ${details.agreed ? "agreed" : "pending"}">
        <div>
          <span>Status</span>
          <strong>${details.agreed ? "Agreement reached" : "More discussion needed"}</strong>
        </div>
        ${details.reason ? html`
          <div>
            <span>Reason</span>
            <p>${details.reason}</p>
          </div>
        ` : ""}
        ${details.summary ? html`
          <div>
            <span>Agreement summary</span>
            <p>${details.summary}</p>
          </div>
        ` : ""}
        ${details.finalAnswer ? html`
          <div>
            <span>Agreed final answer</span>
            <div class="markdown-body compact">${unsafeHTML(renderMarkdown(details.finalAnswer))}</div>
          </div>
        ` : ""}
        ${details.agreedPoints?.length ? html`
          <div>
            <span>Agreed points</span>
            <ul>${details.agreedPoints.map((item) => html`<li>${item}</li>`)}</ul>
          </div>
        ` : ""}
        ${details.remainingRisks?.length ? html`
          <div>
            <span>Remaining risks</span>
            <ul>${details.remainingRisks.map((item) => html`<li>${item}</li>`)}</ul>
          </div>
        ` : ""}
        ${!details.agreed && details.instruction ? html`
          <div>
            <span>Next instruction</span>
            <p>${details.instruction}</p>
          </div>
        ` : ""}
      </div>
    `;
  }

  renderRound(round) {
    return html`
      <section class="round">
        <div class="round-title">
          <h3>Round ${round.index}: ${round.type === "initial-answer" ? "Initial Answer" : "Peer Review"}</h3>
        </div>
        <div class="responses">
          ${repeat(round.responses || [], (response) => response.participantId, (response) => this.renderResponse(response))}
        </div>
      </section>
    `;
  }

  renderRunProgress() {
    return html`
      <section class="progress-panel">
        <div class="section-heading">
          <div class="progress-heading">
            <div>
              <h2>Provider Execution Status</h2>
              <p>Each provider runs in parallel within a round. Default timeout is 2 minutes per provider call.</p>
            </div>
            ${this.isRunning ? html`<button class="danger" @click=${this.stopAgreement}>Stop</button>` : ""}
          </div>
        </div>
        <div class="progress-grid">
          ${this.runProgress.length === 0 ? html`
            <p class="muted">Preparing provider calls...</p>
          ` : repeat(this.runProgress, (item) => `${item.roundIndex}-${item.participantId}`, (item) => html`
            <article class="progress-card ${item.status}">
              <header>
                <strong>${item.displayName}</strong>
                <span>${statusLabel(item.status)}</span>
              </header>
              <p>${item.roundLabel}</p>
              <small>${item.status === "completed"
                ? formatDuration(item.responseMs)
                : elapsedLabel(item.startedAt, item.completedAt)}${item.error ? ` / ${item.error}` : ""}</small>
              ${this.shouldShowTerminal(item.providerConfigId || item.providerId)
                ? this.renderProviderTerminal(item.providerConfigId || item.providerId || item.participantId, item.displayName)
                : ""}
            </article>
          `)}
        </div>
      </section>
    `;
  }

  renderProviderTerminal(providerId, displayName) {
    const logs = this.terminalLogs.filter((log) => log.providerId === providerId || log.participantId === providerId);
    const expanded = Boolean(this.terminalExpanded[providerId]);
    const content = logs.length === 0
      ? "No terminal output yet."
      : logs.map((log) => {
        const text = String(log.content || "");
        return `${text}${text.endsWith("\n") ? "" : "\n"}`;
      }).join("").trim();
    return html`
      <habee-provider-log
        title="Show Terminal"
        label=${displayName}
        .content=${content}
        .expanded=${expanded}
        @toggle=${() => this.toggleTerminal(providerId)}
        @clear=${() => this.clearProviderLogs(providerId)}
      ></habee-provider-log>
    `;
  }

  renderProviderTestLog(providerId, displayName) {
    const expanded = Boolean(this.providerTestExpanded[providerId]);
    const content = this.providerTestLogs[providerId] || "";
    return html`
      <habee-provider-log
        title="Show Log"
        label=${displayName}
        .content=${content || "No test log yet."}
        .expanded=${expanded}
        @toggle=${() => this.toggleProviderTestLog(providerId)}
        @clear=${() => this.clearProviderTestLog(providerId)}
      ></habee-provider-log>
    `;
  }

  renderResponse(response) {
    return html`
      <article class="response ${response.status}">
        <header>
          <strong>${this.participantName(response.participantId)}</strong>
          ${response.status === "completed" ? html`
            <small>Completed / ${formatDuration(response.responseMs)}</small>
          ` : html`<small>Failed / ${formatDuration(response.responseMs)}</small>`}
        </header>
        ${response.status === "completed"
          ? html`<div class="markdown-body">${unsafeHTML(renderMarkdown(response.content))}</div>`
          : html`<p class="error">${response.error}</p>`}
      </article>
    `;
  }

  renderRoundComposer() {
    return html`
      <section class="composer-panel">
        <div>
          <strong>Continue agreement?</strong>
          <p>${this.activeConversation?.coordinator?.mode === "ai"
            ? "AI coordinator mode continues automatically while it is running. You can still add a manual round after it stops."
            : "Add optional instructions for the next round, then ask every AI to review the prior answers."}</p>
        </div>
        ${this.renderCoordinatorControl()}
        <textarea
          rows="3"
          placeholder="Optional instruction for the next round"
          .value=${this.roundInstruction}
          @input=${(event) => this.roundInstruction = event.target.value}
        ></textarea>
        <div class="actions">
          <button class="primary" ?disabled=${this.isRunning || !this.activeConversation} @click=${this.continueRound}>
            Start Next Round
          </button>
        </div>
      </section>
      ${this.isRunning ? this.renderRunProgress() : ""}
    `;
  }

  renderSettings() {
    const draft = this.settingsDraft || { providers: [] };
    return html`
      <section class="settings-layout">
        <div class="section-heading">
          <h2>Provider Management</h2>
          <p>Add ready-made providers. CLI providers use your local login, and API providers only need an API key.</p>
        </div>

        <div class="preset-picker">
          <label>
            <span>Add Provider</span>
            <select .value=${this.providerPresetToAdd} @change=${(event) => this.providerPresetToAdd = event.target.value}>
              ${["CLI", "API"].map((group) => html`
                <optgroup label=${group}>
                  ${providerPresets
                    .filter((preset) => preset.group === group)
                    .map((preset) => html`<option value=${preset.id}>${preset.label}</option>`)}
                </optgroup>
              `)}
            </select>
          </label>
          <button @click=${this.addProviderFromPreset}>Add</button>
        </div>

        <div class="provider-list">
          ${repeat(draft.providers, (provider) => provider.id, (provider, index) => html`
            <article class="provider-editor">
              ${providerHelp(provider)}
              <div class="provider-summary">
                <div>
                  <strong>${provider.displayName}</strong>
                  <p>${provider.mode === "cli" ? "CLI provider" : "API provider"}</p>
                </div>
                <span>${(provider.models || []).map((model) => model.displayName || model.id).join(", ")}</span>
              </div>

              ${provider.mode === "cli" ? html`
                <p class="provider-note">No setup required here. Make sure this CLI is installed and already logged in on this machine.</p>
              ` : html`
                <div class="minimal-provider-settings">
                  <label>
                    <span>API Key</span>
                    <input type="password" .value=${provider.api?.apiKey || ""} @input=${(event) => this.updateProviderNested(index, "api", "apiKey", event.target.value)} />
                  </label>
                </div>
              `}

              <div class="actions between">
                <span class="test-result">${this.testResults[provider.id] || ""}</span>
                <div>
                  <button @click=${() => this.testProvider(provider)}>Test</button>
                  <button class="danger" @click=${() => this.removeProvider(index)}>Del</button>
                </div>
              </div>
              ${provider.mode === "cli" ? this.renderProviderTerminal(provider.id, provider.displayName) : ""}
              ${provider.mode === "api" ? this.renderProviderTestLog(provider.id, provider.displayName) : ""}
            </article>
          `)}
        </div>

        <div class="actions">
          <button class="primary" @click=${this.saveSettings}>Save Settings</button>
        </div>
      </section>
    `;
  }

  availableParticipants() {
    return this.availableParticipantsFromSettings(this.settings);
  }

  availableParticipantsFromSettings(settings) {
    return (settings.providers || [])
      .filter((provider) => provider.enabled !== false)
      .flatMap((provider) => (provider.models || []).map((model) => ({
        key: `${provider.id}:${model.id}`,
        id: cryptoId(`${provider.id}:${model.id}`),
        providerConfigId: provider.id,
        provider: provider.provider,
        mode: provider.mode,
        modelId: model.id,
        providerName: provider.displayName || provider.id,
        modelName: model.displayName || model.id,
        baseName: aiDisplayName(model.displayName || model.id, provider.displayName || provider.id),
        displayName: aiDisplayName(model.displayName || model.id, provider.displayName || provider.id)
      })));
  }

  shouldShowTerminal(providerId) {
    if (!providerId) return false;
    const provider = (this.settings.providers || []).find((item) => item.id === providerId);
    return provider?.mode === "cli";
  }

  openNewChat = () => {
    this.isRunning = false;
    this.stopRequested = false;
    this.view = "new";
    this.prompt = "";
    this.selectedParticipantKeys = this.recentParticipantKeys();
    this.participantToAdd = "";
    this.coordinatorMode = "user";
    this.coordinatorParticipantKey = "";
    this.runProgress = [];
    this.terminalLogs = [];
    this.statusText = "Select participants and enter a prompt";
  };

  recentParticipantKeys() {
    const availableKeys = new Set(this.availableParticipants().map((item) => item.key));
    const recent = (this.conversations || []).find((conversation) => (conversation.participants || []).length > 0);
    return (recent?.participants || [])
      .map((participant) => `${participant.providerConfigId}:${participant.modelId}`)
      .filter((key, index, array) => availableKeys.has(key) && array.indexOf(key) === index);
  }

  openSettings = () => {
    this.settingsDraft = structuredClone(this.settings);
    this.view = "settings";
    this.statusText = "Settings are stored in a local JSON file";
  };

  updatePrompt = (event) => {
    this.prompt = event.target.value;
  };

  addParticipantFromSelect = (event) => {
    if (this.isRunning) return;
    const key = event.target.value;
    if (key && !this.selectedParticipantKeys.includes(key)) {
      this.selectedParticipantKeys = [...this.selectedParticipantKeys, key];
    }
    this.participantToAdd = "";
  };

  removeParticipant(key) {
    if (this.isRunning) return;
    this.selectedParticipantKeys = this.selectedParticipantKeys.filter((item) => item !== key);
  }

  canRun() {
    return !this.isRunning
      && this.prompt.trim()
      && this.selectedParticipantKeys.length > 0;
  }

  coordinatorValue() {
    return this.coordinatorMode === "ai" && this.coordinatorParticipantKey
      ? this.coordinatorParticipantKey
      : "manual";
  }

  selectCoordinator = (event) => {
    if (this.isRunning) return;
    const value = event.target.value;
    if (value === "manual") {
      this.coordinatorMode = "user";
      this.coordinatorParticipantKey = "";
      this.applyCoordinatorToActiveConversation();
      return;
    }
    this.coordinatorMode = "ai";
    this.coordinatorParticipantKey = value;
    this.applyCoordinatorToActiveConversation();
  };

  applyCoordinatorToActiveConversation() {
    if (!this.activeConversation) return;
    this.activeConversation = {
      ...this.activeConversation,
      coordinator: this.currentCoordinatorPayload()
    };
  }

  coordinatorName() {
    const coordinator = this.activeConversation?.coordinator;
    if (!coordinator || coordinator.mode === "user") return "Manual";
    const candidates = [
      ...(this.activeConversation?.participants || []).map((participant) => ({
        key: participant.key || `${participant.providerConfigId}:${participant.modelId}`,
        displayName: participant.baseName || participant.displayName
      })),
      ...this.availableParticipants()
    ];
    return candidates.find((item) => item.key === coordinator.participantKey)?.displayName
      || coordinator.displayName
      || "Unknown model";
  }

  runAgreement = async () => {
    this.isRunning = true;
    this.stopRequested = false;
    this.progressId = `progress-${Date.now()}`;
    this.terminalLogs = [];
    this.statusText = "Providers are running";

    const availableParticipants = this.availableParticipants();
    const participants = this.selectedParticipantKeys
      .map((key) => availableParticipants.find((item) => item.key === key))
      .filter(Boolean)
      .map((participant, index) => {
        const aliased = withParticipantAlias(participant, index);
        const { key, ...payload } = aliased;
        return payload;
      });

    this.runProgress = participants.map((participant) => ({
      participantId: participant.id,
      providerConfigId: participant.providerConfigId,
      displayName: participant.displayName,
      status: "queued",
      roundIndex: 1,
      roundLabel: "Round 1 / Initial Answer",
      startedAt: null,
      completedAt: null,
      responseMs: null,
      usage: null,
      error: null
    }));
    this.scrollWorkspaceToBottom();

    try {
      const conversation = await habeeApi.runAgreement({
        progressId: this.progressId,
        prompt: this.prompt,
        participants,
        coordinator: this.currentCoordinatorPayload(),
        settings: this.settings
      });
      this.activeConversation = conversation;
      this.view = "chat";
      if (this.stopRequested) {
        this.statusText = "Agreement stopped";
      } else if (this.coordinatorMode === "ai") {
        await this.runAutoAgreementLoop();
      } else {
        this.statusText = "Round 1 completed. Continue when you are ready.";
      }
      const state = await habeeApi.getState();
      this.conversations = state.conversations;
    } catch (error) {
      this.statusText = rawErrorMessage(error);
    } finally {
      this.isRunning = false;
    }
  };

  handleProgress(progress) {
    if (!progress || progress.progressId !== this.progressId) return;

    if (progress.type === "terminal-log") {
      this.terminalLogs = [...this.terminalLogs, progress].slice(-500);
      this.scrollWorkspaceToBottom();
      return;
    }

    if (progress.type === "round-started") {
      this.statusText = `${roundLabel(progress.roundIndex, progress.roundType)} started`;
      this.runProgress = this.runProgress.map((item) => ({
        ...item,
        status: "queued",
        roundIndex: progress.roundIndex,
        roundLabel: roundLabel(progress.roundIndex, progress.roundType),
        startedAt: null,
        completedAt: null,
        error: null
      }));
      this.scrollWorkspaceToBottom();
      return;
    }

    if (progress.type === "participant-started" || progress.type === "participant-finished") {
      this.runProgress = this.runProgress.map((item) => {
        if (item.participantId !== progress.participantId) return item;
        return {
          ...item,
          displayName: progress.displayName || item.displayName,
          providerConfigId: progress.providerId || item.providerConfigId,
          status: progress.type === "participant-started" ? "running" : progress.status,
          roundIndex: progress.roundIndex,
          roundLabel: roundLabel(progress.roundIndex, progress.roundType),
          startedAt: progress.startedAt || item.startedAt,
          completedAt: progress.completedAt || null,
          responseMs: progress.responseMs ?? item.responseMs,
          usage: progress.usage ?? item.usage,
          error: progress.error || null
        };
      });
      this.scrollWorkspaceToBottom();
    }

    if (progress.type === "run-completed") {
      this.statusText = "Provider execution completed";
    }
  }

  toggleTerminal(providerId) {
    this.terminalExpanded = {
      ...this.terminalExpanded,
      [providerId]: !this.terminalExpanded[providerId]
    };
  }

  clearProviderLogs(providerId) {
    this.terminalLogs = this.terminalLogs.filter((log) => log.providerId !== providerId && log.participantId !== providerId);
  }

  toggleProviderTestLog(providerId) {
    this.providerTestExpanded = {
      ...this.providerTestExpanded,
      [providerId]: !this.providerTestExpanded[providerId]
    };
  }

  clearProviderTestLog(providerId) {
    this.providerTestLogs = {
      ...this.providerTestLogs,
      [providerId]: ""
    };
  }

  async loadConversation(conversationId) {
    this.activeConversation = await habeeApi.loadConversation(conversationId);
    this.syncCoordinatorFromConversation();
    this.view = "chat";
    this.statusText = "Loaded saved conversation";
  }

  async deleteConversation(event, conversationId) {
    event.stopPropagation();
    if (!window.confirm("Delete this conversation?")) return;
    this.conversations = await habeeApi.deleteConversation(conversationId);
    if (this.activeConversation?.id === conversationId) {
      this.activeConversation = null;
      this.view = "chat";
      this.statusText = "Conversation deleted";
    }
  }

  continueRound = async () => {
    if (!this.activeConversation || this.isRunning) return;
    this.isRunning = true;
    this.stopRequested = false;
    this.progressId = `progress-${Date.now()}`;
    const nextRoundIndex = (this.activeConversation.rounds || []).length + 1;
    this.statusText = `Round ${nextRoundIndex} is running`;
    this.runProgress = (this.activeConversation.participants || []).map((participant) => ({
      participantId: participant.id,
      providerConfigId: participant.providerConfigId,
      displayName: participant.displayName,
      status: "queued",
      roundIndex: nextRoundIndex,
      roundLabel: `Round ${nextRoundIndex} / Peer Review`,
      startedAt: null,
      completedAt: null,
      responseMs: null,
      usage: null,
      error: null
    }));
    this.scrollWorkspaceToBottom();

    try {
      const conversation = await habeeApi.continueAgreement({
        progressId: this.progressId,
        conversation: {
          ...this.activeConversation,
          coordinator: this.currentCoordinatorPayload()
        },
        extraPrompt: this.roundInstruction,
        settings: this.settings
      });
      this.activeConversation = conversation;
      this.roundInstruction = "";
      this.statusText = `Round ${nextRoundIndex} completed. Continue or choose a final opinion.`;
      if (this.activeConversation.coordinator?.mode === "ai" && !this.stopRequested) {
        await this.runAutoAgreementLoop();
      }
      const state = await habeeApi.getState();
      this.conversations = state.conversations;
    } catch (error) {
      this.statusText = rawErrorMessage(error);
    } finally {
      this.isRunning = false;
    }
  };

  runAutoAgreementLoop = async () => {
    const maxRounds = 8;
    while (!this.stopRequested && (this.activeConversation?.rounds || []).length < maxRounds) {
      const nextRoundIndex = (this.activeConversation.rounds || []).length + 1;
      const coordinatorParticipant = this.coordinatorParticipant();
      this.runProgress = coordinatorParticipant ? [{
        participantId: coordinatorParticipant.id,
        providerConfigId: coordinatorParticipant.providerConfigId,
        displayName: coordinatorParticipant.displayName,
        status: "queued",
        roundIndex: nextRoundIndex,
        roundLabel: "Coordinator / Consensus Check",
        startedAt: null,
        completedAt: null,
        responseMs: null,
        usage: null,
        error: null
      }] : [];
      this.statusText = "Coordinator is checking whether everyone agrees";
      this.scrollWorkspaceToBottom();

      const decision = await habeeApi.evaluateConsensus({
        progressId: this.progressId,
        conversation: this.activeConversation,
        settings: this.settings
      });

      if (this.stopRequested) break;
      this.appendCoordinatorDecision(decision);
      if (decision.agreed) {
        this.statusText = "Coordinator completed the agreement";
        break;
      }

      this.runProgress = (this.activeConversation.participants || []).map((participant) => ({
        participantId: participant.id,
        providerConfigId: participant.providerConfigId,
        displayName: participant.displayName,
        status: "queued",
        roundIndex: nextRoundIndex,
        roundLabel: `Round ${nextRoundIndex} / Peer Review`,
        startedAt: null,
        completedAt: null,
        responseMs: null,
        usage: null,
        error: null
      }));
      this.statusText = `Coordinator requested Round ${nextRoundIndex}`;
      this.scrollWorkspaceToBottom();

      this.activeConversation = await habeeApi.continueAgreement({
        progressId: this.progressId,
        conversation: {
          ...this.activeConversation,
          coordinator: this.currentCoordinatorPayload()
        },
        extraPrompt: decision.instruction || "Continue the agreement discussion and resolve remaining disagreements.",
        instructionKind: "coordinator-instruction",
        settings: this.settings
      });
      const state = await habeeApi.getState();
      this.conversations = state.conversations;
    }

    if (this.stopRequested) {
      this.statusText = "Agreement stopped";
    } else if ((this.activeConversation?.rounds || []).length >= maxRounds) {
      this.statusText = `Stopped after ${maxRounds} rounds. Review the conversation before continuing.`;
    }
    if (this.activeConversation) {
      this.activeConversation = await habeeApi.saveConversation(this.activeConversation);
      const state = await habeeApi.getState();
      this.conversations = state.conversations;
    }
  };

  appendCoordinatorDecision(decision) {
    if (!this.activeConversation) return;
    const roundIndex = this.activeConversation.rounds?.length || 0;
    const content = decision.content || [
      decision.agreed ? "Agreement reached." : "Agreement has not been reached yet.",
      decision.reason ? `Reason: ${decision.reason}` : "",
      !decision.agreed && decision.instruction ? `Next instruction: ${decision.instruction}` : ""
    ].filter(Boolean).join("\n");
    this.activeConversation = {
      ...this.activeConversation,
      messages: [
        ...(this.activeConversation.messages || []),
        {
          id: `coordinator-${Date.now()}-${roundIndex}`,
          role: "assistant",
          kind: "coordinator-decision",
          agreed: Boolean(decision.agreed),
          roundIndex,
          coordinator: this.activeConversation.coordinator || this.currentCoordinatorPayload(),
          summary: decision.summary || "",
          finalAnswer: decision.finalAnswer || "",
          agreedPoints: decision.agreedPoints || [],
          remainingRisks: decision.remainingRisks || [],
          reason: decision.reason || "",
          instruction: decision.instruction || "",
          rawContent: decision.rawContent || decision.content || "",
          content,
          createdAt: new Date().toISOString()
        }
      ],
      updatedAt: new Date().toISOString()
    };
  }

  currentCoordinatorPayload() {
    if (this.coordinatorMode !== "ai") {
      return { mode: "user", participantKey: "", displayName: "Manual" };
    }
    const coordinator = this.availableParticipants().find((item) => item.key === this.coordinatorParticipantKey);
    return {
      mode: "ai",
      participantKey: this.coordinatorParticipantKey,
      displayName: coordinator?.displayName || ""
    };
  }

  syncCoordinatorFromConversation() {
    const coordinator = this.activeConversation?.coordinator;
    if (!coordinator || coordinator.mode === "user") {
      this.coordinatorMode = "user";
      this.coordinatorParticipantKey = "";
      return;
    }
    this.coordinatorMode = "ai";
    this.coordinatorParticipantKey = coordinator.participantKey || "";
  }

  coordinatorParticipant() {
    const coordinator = this.activeConversation?.coordinator;
    if (!coordinator || coordinator.mode !== "ai") return null;
    return this.availableParticipants().find((item) => item.key === coordinator.participantKey) || null;
  }

  stopAgreement = async () => {
    if (!this.isRunning) return;
    this.stopRequested = true;
    this.statusText = "Stopping agreement...";
    try {
      await habeeApi.stopAgreement?.({ progressId: this.progressId });
    } catch {
      // Stop is best-effort; the UI still prevents the next automatic round.
    }
  };

  scrollWorkspaceToBottom() {
    window.requestAnimationFrame(() => {
      const workspace = this.querySelector(".workspace");
      if (workspace) workspace.scrollTop = workspace.scrollHeight;
    });
  }

  participantName(participantId) {
    const participant = this.activeConversation?.participants?.find((item) => item.id === participantId);
    return participant?.displayName || participantId;
  }

  addProviderFromPreset = () => {
    const preset = providerPresets.find((item) => item.id === this.providerPresetToAdd) || providerPresets[0];
    if (!preset) return;
    const provider = providerFromPreset(preset);
    this.settingsDraft = {
      ...this.settingsDraft,
      providers: [...this.settingsDraft.providers, provider]
    };
  };

  removeProvider(index) {
    this.settingsDraft = {
      ...this.settingsDraft,
      providers: this.settingsDraft.providers.filter((_, current) => current !== index)
    };
  }

  updateProviderNested(index, group, field, value) {
    const providers = structuredClone(this.settingsDraft.providers);
    providers[index][group] = { ...providers[index][group], [field]: value };
    this.settingsDraft = { ...this.settingsDraft, providers };
  }

  saveSettings = async () => {
    this.settings = await habeeApi.saveSettings(this.settingsDraft);
    this.statusText = "Settings saved";
  };

  testProvider = async (provider) => {
    this.progressId = `test-${Date.now()}`;
    this.clearProviderLogs(provider.id);
    this.clearProviderTestLog(provider.id);
    this.testResults = { ...this.testResults, [provider.id]: "Testing..." };
    const result = await habeeApi.testProvider({
      progressId: this.progressId,
      providerConfig: provider
    });
    this.providerTestLogs = {
      ...this.providerTestLogs,
      [provider.id]: result.ok ? result.content : result.error
    };
    this.testResults = {
      ...this.testResults,
      [provider.id]: result.ok ? "Test passed" : "Test failed. Open Log for details."
    };
  };

}

function providerHelp(provider) {
  const fallback = providerPresets.find((preset) => {
    return preset.provider === provider.provider && preset.mode === provider.mode
      && (provider.displayName || "").toLowerCase().includes(preset.displayName.toLowerCase().replace(" api", "").replace(" cli", ""));
  }) || providerPresets.find((preset) => preset.provider === provider.provider && preset.mode === provider.mode);
  const setupText = provider.setupText || fallback?.setupText || (provider.mode === "cli"
    ? "Install this CLI, then sign in locally before using it in Habee."
    : "Create an API key from the provider console and paste it below.");
  const setupUrl = provider.setupUrl || fallback?.setupUrl || "";
  return html`
    <div class="provider-help">
      <p>${setupText}</p>
      ${setupUrl ? html`<a href=${setupUrl} target="_blank" rel="noreferrer">Setup guide</a>` : ""}
    </div>
  `;
}

customElements.define("habee-app", HabeeApp);

