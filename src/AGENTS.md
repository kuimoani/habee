# Habee Development Guide

## Product Summary

Habee means "agreement" in Korean. Habee is a desktop AI collaboration app where multiple AI models answer the same user request, review one another's answers, and help the user reach a better final conclusion.

The first MVP should focus on a practical desktop workflow:

- The user creates a new chat.
- The user selects multiple AI participants by provider and model.
- The user enters a prompt.
- All selected models generate answers in parallel.
- Habee displays every model answer and discussion step.
- Habee summarizes each model's answer.
- The user manually chooses which opinion or answer is best.
- Habee stores the conversation locally as JSON.

Future versions may add automatic judge models or configurable agreement criteria, but the MVP uses explicit user selection as the agreement decision.

## MVP Scope

The first version must include both CLI and API integration modes.

Supported providers for MVP:

- Codex
- Claude

Integration modes:

- CLI mode
  - Uses a local CLI that the user has already installed and authenticated.
  - Example: Codex CLI, Claude CLI.
  - The app should execute configured commands and capture stdout/stderr.
- API mode
  - Uses API keys registered by the user.
  - API keys are stored in a local settings file for MVP.
  - Stronger secret storage, such as OS keychain integration, can be added later.

## Technology Stack

Use a simple Electron desktop stack:

- Electron
- Plain HTML
- CSS
- JavaScript
- Lit for web components

Avoid introducing React, Vue, or large frontend frameworks unless the user explicitly changes the stack.

## Main UI Structure

The application should have a desktop app layout with:

- Left sidebar
  - New chat
  - Previous conversations
  - Settings
- Main center panel
  - Chat prompt input
  - Conversation messages
  - Model answer panels
  - Discussion rounds
  - Final user-selected result

## Required Screens

### Chat Screen

The main conversation screen should show:

- User prompt
- Selected AI participants
- Round-by-round model responses
- Full discussion process
- Per-model answer summaries
- User selection controls for choosing the best answer/opinion
- Final selected result

### New Chat Model Selection

When the user clicks New chat, show a model selection screen or modal.

The user must be able to select multiple participants by:

- Provider
- Model
- Integration mode, when relevant

For MVP, support Codex and Claude entries. The implementation may start with manually configured model names and later add provider-driven model discovery.

### Settings Screen

The settings screen should support provider management:

- Add provider configuration
- Delete provider configuration
- Choose provider type: Codex or Claude
- Choose integration mode: CLI or API
- Configure CLI command/path for CLI mode
- Configure API key for API mode
- Configure available model names
- Test provider connection if feasible

### Conversation History

Previous conversations should be listed from local JSON files.

Each saved conversation should include enough data to reconstruct:

- Chat title
- Created/updated timestamps
- User prompts
- Selected participants
- All model responses
- All discussion rounds
- Per-model summaries
- User-selected final result

## Data Storage

Use local JSON files for MVP.

Recommended storage separation:

- Settings JSON
  - Provider configurations
  - CLI commands
  - API keys
  - Model lists
- Conversation JSON files
  - One file per conversation, or one append-only conversations file if simpler

API keys may be stored in the local settings file for MVP, but keep this isolated so it can later be replaced with encrypted or OS keychain storage.

## Suggested Data Models

### Provider Config

```js
{
  id: "provider-config-id",
  provider: "codex",
  displayName: "Codex CLI",
  mode: "cli",
  enabled: true,
  cli: {
    command: "codex",
    argsTemplate: ["--prompt", "{{prompt}}"]
  },
  api: {
    apiKey: "",
    baseUrl: "",
    models: []
  },
  models: [
    {
      id: "model-id",
      displayName: "Model name"
    }
  ]
}
```

### Chat Participant

```js
{
  id: "participant-id",
  providerConfigId: "provider-config-id",
  provider: "codex",
  mode: "cli",
  modelId: "model-id",
  displayName: "Codex / model-id"
}
```

### Conversation

```js
{
  id: "conversation-id",
  title: "Conversation title",
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
  participants: [],
  messages: [],
  rounds: [],
  summaries: [],
  userSelectedResult: null
}
```

### Discussion Round

```js
{
  id: "round-id",
  index: 1,
  type: "initial-answer",
  prompt: "User prompt or review prompt",
  responses: [
    {
      participantId: "participant-id",
      status: "completed",
      content: "Model response",
      error: null,
      startedAt: "2026-06-13T00:00:00.000Z",
      completedAt: "2026-06-13T00:00:00.000Z"
    }
  ]
}
```

## Agreement Flow For MVP

The MVP agreement flow is user-driven:

1. User starts a new chat and selects AI participants.
2. User submits a prompt.
3. Habee asks every selected participant to answer the prompt in parallel.
4. Habee displays all raw answers.
5. Habee asks each participant to summarize or evaluate the set of answers.
6. Habee displays every summary and evaluation.
7. The user chooses the best answer or opinion.
8. Habee records the selected answer as the final result.

Do not implement automatic consensus termination as the primary MVP behavior. That is a future feature.

## Future Direction

Design the code so these features can be added later:

- AI judge mode
- User-selected judge mode
- Automatic consensus scoring
- Configurable max discussion rounds
- Provider model discovery
- Secure API key storage
- More providers, such as OpenAI, Gemini, Ollama, or local models
- Conversation export
- Streaming responses

## Implementation Notes For Coding Agents

- Keep the first implementation small and shippable.
- Prefer clear modules for:
  - Electron main process
  - Preload IPC bridge
  - Provider adapters
  - Local JSON storage
  - Lit UI components
  - Chat orchestration
- Do not hard-code provider logic directly into UI components.
- Use provider adapter interfaces so CLI and API modes can share a common call shape.
- Keep provider execution and API-key handling in the Electron main process, not the renderer.
- The renderer should call safe IPC methods exposed by preload.
- Store complete discussion details because MVP must show the full process.
- Keep all timestamps in ISO 8601 format.
- Use English identifiers in code and Korean-friendly display text in the UI where appropriate.
