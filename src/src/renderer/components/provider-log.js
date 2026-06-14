import { LitElement, css, html } from "lit";

export class HabeeProviderLog extends LitElement {
  static properties = {
    title: { type: String },
    label: { type: String },
    content: { type: String },
    expanded: { type: Boolean }
  };

  static styles = css`
    :host {
      display: block;
      margin-top: 18px;
      border: 1px solid #303a49;
      border-radius: 8px;
      overflow: hidden;
      background: #090d13;
      color: #e7ecf3;
    }

    button {
      font: inherit;
      cursor: pointer;
    }

    .toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 12px;
      min-height: 40px;
      color: #e7ecf3;
      background: #090d13;
      border: 0;
      border-bottom: 1px solid #303a49;
      border-radius: 0;
      text-align: left;
    }

    small {
      color: #9aa6b5;
    }

    pre {
      margin: 0;
      min-height: 180px;
      max-height: 360px;
      overflow: auto;
      padding: 14px;
      color: #e7ecf3;
      white-space: pre-wrap;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 0.86rem;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      padding: 10px 12px;
      border-top: 1px solid #303a49;
    }

    .actions button {
      min-height: 30px;
      background: #222938;
      border: 1px solid #3e4658;
      border-radius: 6px;
      color: #e7ecf3;
      padding: 0 12px;
    }
  `;

  constructor() {
    super();
    this.title = "Show Log";
    this.label = "";
    this.content = "";
    this.expanded = false;
  }

  render() {
    return html`
      <button class="toggle" @click=${this.toggle}>
        <span>${this.expanded ? this.title.replace(/^Show/, "Hide") : this.title}</span>
        <small>${this.label}</small>
      </button>
      ${this.expanded ? html`
        <pre>${this.content || "No log yet."}</pre>
        <div class="actions">
          <button @click=${this.clear}>Clear</button>
        </div>
      ` : ""}
    `;
  }

  toggle = () => {
    this.dispatchEvent(new CustomEvent("toggle", { bubbles: true, composed: true }));
  };

  clear = () => {
    this.dispatchEvent(new CustomEvent("clear", { bubbles: true, composed: true }));
  };
}

customElements.define("habee-provider-log", HabeeProviderLog);
