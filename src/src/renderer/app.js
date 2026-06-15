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
  cryptoId,
  elapsedLabel,
  formatDate,
  formatDuration,
  rawErrorMessage,
  reviewerDisplayName,
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
    reviewerParticipantKey: { state: true },
    showContinueAfterAgreement: { state: true },
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
    this.reviewerParticipantKey = "";
    this.showContinueAfterAgreement = false;
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
    this.ensurePresetSelection();
    this.runStartupProviderChecks();
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
            <button class=${classMap({ active: this.view === "settings", warning: this.hasProviderProblems() })} @click=${this.openSettings}>
              Settings ${this.hasProviderProblems() ? html`<span class="nav-alert">!</span>` : ""}
            </button>
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
          <h2>Consensus Reviewer</h2>
          <p>Choose one model to evaluate agreement status, reasons, agreed points, and remaining risks after each round.</p>
        </div>
        ${this.renderReviewerControl()}
      </section>

      <section class="panel">
        <div class="section-heading">
          <h2>Prompt</h2>
          <p>Write the request that every participant should answer.</p>
        </div>
        <label class="prompt-box">
          <span>Prompt</span>
          <div class="prompt-input">
            <textarea
              rows="5"
              placeholder="Enter the request that multiple AIs should answer and review."
              .value=${this.prompt}
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

  renderReviewerControl() {
    const participants = this.availableParticipants();
    return html`
      <div class="reviewer-box">
        <label>
          <span>Consensus Reviewer</span>
          <select .value=${this.reviewerParticipantKey} ?disabled=${this.isRunning} @change=${this.selectReviewer}>
            <option value="">Select a reviewer</option>
            ${participants.map((item) => html`<option value=${item.key}>${item.displayName}</option>`)}
          </select>
          <small class="mode-note">The reviewer does not run the next round. It only evaluates whether the current answers have converged.</small>
        </label>
      </div>
    `;
  }

  renderChat() {
    if (!this.activeConversation && !this.isRunning) {
      return html`
        <section class="welcome">
          <h2>Compare multiple AI answers in one place</h2>
          <p>Start a new chat to collect answers, reviews, consensus checks, and a final agreement trail.</p>
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
            <p class="muted">Consensus Reviewer: ${this.reviewerName()}</p>
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
    const roundInstructions = messages.filter((message) => message.kind === "round-instruction");
    const reviewerMessages = messages.filter((message) => ["consensus-review", "coordinator-decision"].includes(message.kind));
    const instructionForRound = (round) => {
      return roundInstructions.find((message) => message.roundIndex === round.index);
    };

    return html`
      <div class="conversation-flow">
        ${repeat(rounds, (round) => round.id, (round) => {
          const instruction = instructionForRound(round);
          return html`
          ${round.index === 1 && initialMessage ? this.renderMessageBlock(initialMessage, "User request") : ""}
          ${round.index > 1 && instruction
            ? this.renderMessageBlock(instruction, "Next round instruction")
            : ""}
          ${this.renderRound(round)}
          ${reviewerMessages
            .filter((message) => message.roundIndex === round.index)
            .map((message) => this.renderMessageBlock(message, message.agreed ? "Agreement reached" : "Consensus review"))}
        `;
        })}
      </div>
    `;
  }

  renderMessageBlock(message, label) {
    const showReviewer = ["consensus-review", "coordinator-decision"].includes(message.kind);
    const reviewerLabel = reviewerDisplayName(message.reviewer || message.coordinator || this.activeConversation?.reviewer || this.activeConversation?.coordinator);
    return html`
      <article class="message ${message.role}">
        <strong>${label}</strong>
        ${showReviewer ? html`
          <div class="message-meta">
            <span>Consensus Reviewer</span>
            <b>${reviewerLabel}</b>
          </div>
        ` : ""}
        ${["consensus-review", "coordinator-decision"].includes(message.kind)
          ? this.renderReviewerDecision(message)
          : html`<p>${message.content}</p>`}
      </article>
    `;
  }

  renderReviewerDecision(message) {
    const details = consensusDetailsFromMessage(message);
    if (!details) return html`<p>${message.content}</p>`;
    return html`
      <div class="decision-card ${details.agreed ? "agreed" : "pending"}">
        <div class="decision-status">
          <span>Status</span>
          <strong>${details.agreed ? "Agreement reached" : "More discussion needed"}</strong>
        </div>
        <div class="decision-main">
          ${details.reason ? html`<section>
            <span>Reason</span>
            <p>${details.reason}</p>
          </section>` : ""}
          ${details.summary ? html`<section>
            <span>Summary</span>
            <p>${details.summary}</p>
          </section>` : ""}
        </div>
        ${details.agreedPoints?.length ? html`
          <div class="decision-list agreed-points">
            <span>Agreed points</span>
            <ul>${details.agreedPoints.map((item) => html`<li>${item}</li>`)}</ul>
          </div>
        ` : ""}
        ${details.remainingRisks?.length ? html`
          <div class="decision-list remaining-risks">
            <span>Remaining risks</span>
            <ul>${details.remainingRisks.map((item) => html`<li>${item}</li>`)}</ul>
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
    const isReviewerRun = this.isReviewerRun();
    return html`
      <section class="progress-panel ${isReviewerRun ? "reviewer-progress" : "participant-progress"}">
        <div class="section-heading">
          <div class="progress-heading">
            <div>
              <h2>${isReviewerRun ? "Consensus Reviewer Checking" : "AI Participants Thinking"}</h2>
              <p>${isReviewerRun
                ? "The selected reviewer is evaluating agreement status, reasons, agreed points, and remaining risks."
                : "Selected participants are answering in parallel for this round. Default timeout is 2 minutes per provider call."}</p>
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

  isReviewerRun() {
    return this.runProgress.some((item) => String(item.roundLabel || "").includes("Consensus Reviewer"));
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
    const name = this.participantName(response.participantId);
    const color = participantColor(name);
    const logId = `response-error-${response.participantId}-${response.startedAt || response.completedAt || ""}`;
    return html`
      <article class="response ${response.status}" style="--participant-color: ${color}; --participant-soft-color: ${softParticipantColor(color)};">
        <header>
          <strong>${name}</strong>
          ${response.status === "completed" ? html`
            <small>Completed / ${formatDuration(response.responseMs)}</small>
          ` : html`<small>Failed / ${formatDuration(response.responseMs)}</small>`}
        </header>
        ${response.status === "completed"
          ? html`<div class="markdown-body">${unsafeHTML(renderMarkdown(response.content))}</div>`
          : html`
            <div class="response-error-summary">Provider returned an error.</div>
            <habee-provider-log
              title="Show Error"
              label=${name}
              .content=${response.error || "Unknown error"}
              .expanded=${Boolean(this.terminalExpanded[logId])}
              @toggle=${() => this.toggleTerminal(logId)}
              @clear=${() => {}}
            ></habee-provider-log>
          `}
      </article>
    `;
  }

  renderRoundComposer() {
    if (this.isRunning && this.isReviewerRun()) {
      return this.renderRunProgress();
    }
    const latestReview = this.latestConsensusReview();
    if (latestReview?.agreed && !this.showContinueAfterAgreement) {
      return html`
        <section class="composer-panel compact-composer">
          <div>
            <strong>Agreement reached</strong>
            <p>The consensus reviewer marked this discussion as complete. You can still continue manually.</p>
          </div>
          <button @click=${() => this.showContinueAfterAgreement = true}>Continue anyway</button>
        </section>
      `;
    }

    return html`
      <section class="composer-panel">
        <div>
          <strong>Continue agreement?</strong>
          <p>Add optional instructions for the next round. The consensus reviewer suggestion may already be filled in, but you decide what to send.</p>
        </div>
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

  latestConsensusReview() {
    const messages = this.activeConversation?.messages || [];
    return [...messages].reverse().find((message) => ["consensus-review", "coordinator-decision"].includes(message.kind));
  }

  renderSettings() {
    const draft = this.settingsDraft || { providers: [] };
    const addablePresets = this.addableProviderPresets(draft.providers);
    const selectedPreset = addablePresets.find((preset) => preset.id === this.providerPresetToAdd) || addablePresets[0];
    return html`
      <section class="settings-layout">
        <div class="settings-section provider-add-section">
          <div class="section-heading">
            <h2>Add Provider</h2>
            <p>Add a ready-made provider once. CLI providers use local login; API providers need an API key.</p>
          </div>
          <div class="preset-picker">
            <label>
              <span>Provider preset</span>
              <select .value=${selectedPreset?.id || ""} ?disabled=${addablePresets.length === 0} @change=${(event) => this.providerPresetToAdd = event.target.value}>
                ${["CLI", "API"].map((group) => {
                  const groupPresets = addablePresets.filter((preset) => preset.group === group);
                  return groupPresets.length ? html`
                    <optgroup label=${group}>
                      ${groupPresets.map((preset) => html`<option value=${preset.id}>${preset.label}</option>`)}
                    </optgroup>
                  ` : "";
                })}
              </select>
            </label>
            <button ?disabled=${addablePresets.length === 0} @click=${this.addProviderFromPreset}>Add Provider</button>
          </div>
          ${addablePresets.length === 0 ? html`<p class="muted">All provider presets have already been added.</p>` : ""}
        </div>

        <div class="settings-section configured-provider-section">
          <div class="section-heading">
            <h2>Configured Providers</h2>
            <p>Health checks do not send prompts. CLI checks run a local status command, and API checks validate the key against provider metadata endpoints.</p>
          </div>
          <div class="provider-list">
            ${draft.providers.length === 0 ? html`<p class="muted">No providers configured.</p>` : repeat(draft.providers, (provider) => provider.id, (provider, index) => {
              const state = this.providerTestState(provider.id);
              return html`
            <article class="provider-editor ${state.status}">
              <div class="provider-summary">
                <div>
                  <strong>${provider.displayName}</strong>
                  <p>${provider.mode === "cli" ? "CLI provider" : "API provider"}</p>
                  <p class="model-list">${this.providerModelNames(provider)}</p>
                </div>
                <span class="health-pill ${state.status}">${state.label}</span>
              </div>
              ${providerHelp(provider)}

              ${provider.mode === "cli" ? html`
                <p class="provider-note">Local CLI check only. No prompt is sent.</p>
              ` : html`
                <div class="minimal-provider-settings">
                  <label>
                    <span>API Key</span>
                    <input type="password" .value=${provider.api?.apiKey || ""} @input=${(event) => this.updateProviderNested(index, "api", "apiKey", event.target.value)} />
                  </label>
                </div>
              `}

              <div class="actions between">
                <span class="test-result">${state.message}</span>
                <div>
                  <button @click=${() => this.testProvider(provider)}>Check</button>
                  <button class="danger" @click=${() => this.removeProvider(index)}>Del</button>
                </div>
              </div>
              ${provider.mode === "cli" ? this.renderProviderTerminal(provider.id, provider.displayName) : ""}
              ${provider.mode === "api" ? this.renderProviderTestLog(provider.id, provider.displayName) : ""}
            </article>
          `;})}
          </div>
        </div>

        <div class="actions">
          <button @click=${this.showSettingsFile}>Open Settings JSON</button>
          <button class="primary" @click=${this.saveSettings}>Save Settings</button>
        </div>
      </section>
    `;
  }

  availableParticipants() {
    return this.availableParticipantsFromSettings(this.settings);
  }

  addableProviderPresets(providers = []) {
    return providerPresets.filter((preset) => !providers.some((provider) => sameProviderPreset(provider, preset)));
  }

  ensurePresetSelection() {
    const addable = this.addableProviderPresets(this.settingsDraft?.providers || []);
    if (!addable.some((preset) => preset.id === this.providerPresetToAdd)) {
      this.providerPresetToAdd = addable[0]?.id || "";
    }
  }

  providerTestState(providerId) {
    const state = this.testResults[providerId];
    if (!state) return { status: "unknown", label: "Not checked", message: "" };
    if (typeof state === "string") return { status: "unknown", label: state, message: state };
    return state;
  }

  providerModelNames(provider) {
    return (provider.models || [])
      .map((model) => model.displayName || model.id)
      .filter(Boolean)
      .join(", ") || "No models";
  }

  hasProviderProblems() {
    return Object.values(this.testResults || {}).some((state) => {
      const normalized = typeof state === "string" ? { status: "unknown" } : state;
      return normalized?.status === "error";
    });
  }

  runStartupProviderChecks() {
    for (const provider of this.settings.providers || []) {
      if (provider.enabled !== false) {
        this.testProvider(provider, { silent: true });
      }
    }
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
    this.reviewerParticipantKey = this.recentReviewerKey();
    this.showContinueAfterAgreement = false;
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

  recentReviewerKey() {
    const availableKeys = new Set(this.availableParticipants().map((item) => item.key));
    const recent = (this.conversations || []).find((conversation) => conversation.reviewer?.participantKey || conversation.coordinator?.participantKey);
    const key = recent?.reviewer?.participantKey || recent?.coordinator?.participantKey || "";
    return availableKeys.has(key) ? key : "";
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
      && this.selectedParticipantKeys.length > 0
      && this.reviewerParticipantKey;
  }

  selectReviewer = (event) => {
    if (this.isRunning) return;
    this.reviewerParticipantKey = event.target.value;
    this.applyReviewerToActiveConversation();
  };

  applyReviewerToActiveConversation() {
    if (!this.activeConversation) return;
    this.activeConversation = {
      ...this.activeConversation,
      reviewer: this.currentReviewerPayload()
    };
  }

  reviewerName() {
    const reviewer = this.activeConversation?.reviewer || this.activeConversation?.coordinator;
    if (!reviewer) return "No reviewer";
    const candidates = [
      ...(this.activeConversation?.participants || []).map((participant) => ({
        key: participant.key || `${participant.providerConfigId}:${participant.modelId}`,
        displayName: participant.baseName || participant.displayName
      })),
      ...this.availableParticipants()
    ];
    return candidates.find((item) => item.key === reviewer.participantKey)?.displayName
      || reviewer.displayName
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
        reviewer: this.currentReviewerPayload(),
        settings: this.settings
      });
      this.activeConversation = conversation;
      this.view = "chat";
      if (this.stopRequested) {
        this.statusText = "Agreement stopped";
      } else {
        await this.evaluateReviewerOnce();
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
    this.syncReviewerFromConversation();
    this.showContinueAfterAgreement = false;
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
          reviewer: this.currentReviewerPayload()
        },
        extraPrompt: this.roundInstruction,
        settings: this.settings
      });
      this.activeConversation = conversation;
      this.roundInstruction = "";
      this.statusText = `Round ${nextRoundIndex} completed. Continue or choose a final opinion.`;
      if (!this.stopRequested) {
        await this.evaluateReviewerOnce();
      }
      const state = await habeeApi.getState();
      this.conversations = state.conversations;
    } catch (error) {
      this.statusText = rawErrorMessage(error);
    } finally {
      this.isRunning = false;
    }
  };

  evaluateReviewerOnce = async () => {
    if (!this.activeConversation) return;
    const activeReviewer = this.activeConversation.reviewer || this.activeConversation.coordinator;
    if (!activeReviewer?.participantKey) return;
    const checkedRoundIndex = this.activeConversation.rounds?.length || 0;
    const reviewerParticipant = this.reviewerParticipant();
    this.runProgress = reviewerParticipant ? [{
      participantId: reviewerParticipant.id,
      providerConfigId: reviewerParticipant.providerConfigId,
      displayName: reviewerParticipant.displayName,
      status: "queued",
      roundIndex: checkedRoundIndex,
      roundLabel: "Consensus Reviewer / Agreement Check",
      startedAt: null,
      completedAt: null,
      responseMs: null,
      usage: null,
      error: null
    }] : [];
    this.statusText = "Consensus reviewer is checking whether everyone agrees";
    this.scrollWorkspaceToBottom();

    const decision = await habeeApi.evaluateConsensus({
      progressId: this.progressId,
      conversation: {
        ...this.activeConversation,
        reviewer: this.currentReviewerPayload()
      },
      settings: this.settings
    });

    if (this.stopRequested) {
      this.statusText = "Agreement stopped";
      return;
    }

    this.appendReviewerDecision(decision);
    if (!decision.agreed && decision.instruction && !this.roundInstruction.trim()) {
      this.roundInstruction = decision.instruction;
    }
    this.showContinueAfterAgreement = false;
    this.activeConversation = await habeeApi.saveConversation(this.activeConversation);
    const state = await habeeApi.getState();
    this.conversations = state.conversations;
    this.statusText = decision.agreed
      ? "Consensus reviewer marked the agreement as reached."
      : "Consensus reviewer suggested a next instruction. Start the next round when you are ready.";
  };

  appendReviewerDecision(decision) {
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
          id: `reviewer-${Date.now()}-${roundIndex}`,
          role: "assistant",
          kind: "consensus-review",
          agreed: Boolean(decision.agreed),
          roundIndex,
          reviewer: this.activeConversation.reviewer || this.currentReviewerPayload(),
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

  currentReviewerPayload() {
    const reviewer = this.availableParticipants().find((item) => item.key === this.reviewerParticipantKey);
    return {
      participantKey: this.reviewerParticipantKey,
      displayName: reviewer?.displayName || ""
    };
  }

  syncReviewerFromConversation() {
    const reviewer = this.activeConversation?.reviewer || this.activeConversation?.coordinator;
    this.reviewerParticipantKey = reviewer?.participantKey || "";
  }

  reviewerParticipant() {
    const reviewer = this.activeConversation?.reviewer || this.activeConversation?.coordinator;
    if (!reviewer?.participantKey) return null;
    return this.availableParticipants().find((item) => item.key === reviewer.participantKey) || null;
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
    const addable = this.addableProviderPresets(this.settingsDraft?.providers || []);
    const preset = addable.find((item) => item.id === this.providerPresetToAdd) || addable[0];
    if (!preset) return;
    const provider = providerFromPreset(preset);
    this.settingsDraft = {
      ...this.settingsDraft,
      providers: [...this.settingsDraft.providers, provider]
    };
    this.ensurePresetSelection();
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
    this.ensurePresetSelection();
    this.runStartupProviderChecks();
  };

  showSettingsFile = async () => {
    try {
      await habeeApi.showSettingsFile?.();
      this.statusText = "Settings JSON location opened";
    } catch (error) {
      this.statusText = rawErrorMessage(error);
    }
  };

  testProvider = async (provider, options = {}) => {
    this.progressId = `test-${Date.now()}`;
    this.clearProviderLogs(provider.id);
    this.clearProviderTestLog(provider.id);
    this.testResults = {
      ...this.testResults,
      [provider.id]: { status: "checking", label: "Checking", message: "Checking..." }
    };
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
      [provider.id]: result.ok
        ? { status: "ok", label: "Ready", message: "Health check passed" }
        : { status: "error", label: "Problem", message: "Health check failed. Open log for details." }
    };
    if (!options.silent) {
      this.statusText = result.ok ? `${provider.displayName} is ready` : `${provider.displayName} has a health check problem`;
    }
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

function sameProviderPreset(provider, preset) {
  if (provider.presetId && provider.presetId === preset.id) return true;
  return provider.provider === preset.provider
    && provider.mode === preset.mode
    && (provider.displayName || "").toLowerCase() === preset.displayName.toLowerCase();
}

function participantColor(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 68% 58%)`;
}

function softParticipantColor(color) {
  return color.replace("58%)", "18% / 0.42)");
}

customElements.define("habee-app", HabeeApp);
