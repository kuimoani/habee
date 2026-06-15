import { LitElement, css, html } from "lit";

export class HabeeAboutDialog extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(5, 8, 12, 0.72);
    }

    section {
      width: min(560px, 100%);
      border: 1px solid #303a49;
      border-radius: 8px;
      background: #151b24;
      color: #e7ecf3;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid #2a323f;
    }

    h2,
    p {
      margin: 0;
    }

    p,
    dt {
      color: #9aa6b5;
    }

    button {
      border: 1px solid #3a4250;
      background: #1a202b;
      color: #e7ecf3;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 6px;
      cursor: pointer;
    }

    .content {
      display: grid;
      gap: 12px;
      padding: 20px;
    }

    dl {
      display: grid;
      gap: 10px;
      margin: 0;
    }

    dl > div {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 10px;
    }

    dd {
      margin: 0;
    }

    a {
      color: #72dec8;
    }
  `;

  render() {
    return html`
      <section @click=${(event) => event.stopPropagation()}>
        <header>
          <div class="brand">
            <h2>Habee</h2>
            <p>AI agreement desk</p>
          </div>
          <button title="Close" @click=${this.close}>X</button>
        </header>
        <div class="content">
          <p>Habee helps multiple AI providers answer the same request, review one another, and move toward an agreed result.</p>
          <dl>
            <div><dt>Version</dt><dd>v0.1.0</dd></div>
            <div><dt>Creator</dt><dd>kuimoani</dd></div>
            <div><dt>GitHub</dt><dd><a href="https://github.com/kuimoani/habee" target="_blank" rel="noreferrer">https://github.com/kuimoani/habee</a></dd></div>
          </dl>
        </div>
      </section>
    `;
  }

  close = () => {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
}

customElements.define("habee-about-dialog", HabeeAboutDialog);
