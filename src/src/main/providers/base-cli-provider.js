import { spawn } from "node:child_process";
import { BaseProvider, rawErrorMessage } from "./base-provider.js";

export class BaseCliProvider extends BaseProvider {
  async call(_participant, prompt, options = {}) {
    return this.runCommand(prompt, options);
  }

  testModels() {
    return (this.config.models || []).slice(0, 1);
  }

  runCommand(prompt, options = {}) {
    const commandLine = this.commandLine();
    const [command, ...argsTemplate] = splitCommandLine(commandLine);
    if (!command) throw new Error("CLI command is empty.");

    const args = argsTemplate.map((arg) => String(arg).replaceAll("{{prompt}}", prompt));
    const onProgress = options.onProgress || (() => {});
    const logBase = {
      participantId: options.participant?.id,
      displayName: options.participant?.displayName || this.config.displayName,
      providerId: this.config.id
    };

    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }

      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        cwd: this.config.cli?.cwd || process.cwd(),
        env: {
          ...process.env,
          NO_COLOR: "1",
          CI: process.env.CI || "1"
        }
      });
      child.stdin?.end();

      let stdout = "";
      let stderr = "";
      let settled = false;
      const abortHandler = () => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error("aborted"));
      };
      options.signal?.addEventListener("abort", abortHandler, { once: true });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        options.signal?.removeEventListener("abort", abortHandler);
        reject(new Error(`timeout ${Math.round(this.timeoutMs() / 1000)}s`));
      }, this.timeoutMs());

      child.stdout.on("data", (data) => {
        const content = data.toString();
        stdout += content;
        onProgress({ type: "terminal-log", stream: "stdout", content, createdAt: new Date().toISOString(), ...logBase });
      });

      child.stderr.on("data", (data) => {
        const content = data.toString();
        stderr += content;
        onProgress({ type: "terminal-log", stream: "stderr", content, createdAt: new Date().toISOString(), ...logBase });
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abortHandler);
        onProgress({ type: "terminal-log", stream: "error", content: rawErrorMessage(error), createdAt: new Date().toISOString(), ...logBase });
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abortHandler);
        if (code !== 0) {
          reject(new Error(stderr.trim() || String(code)));
          return;
        }
        resolve({ text: stdout.trim(), usage: null });
      });
    });
  }

  commandLine() {
    return this.config.cli?.commandLine || [this.config.cli?.command, ...(this.config.cli?.argsTemplate || [])].filter(Boolean).join(" ");
  }
}

function splitCommandLine(commandLine) {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaping = false;

  for (const char of String(commandLine || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}
