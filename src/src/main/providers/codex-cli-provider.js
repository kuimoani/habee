import { BaseCliProvider } from "./base-cli-provider.js";

const DEFAULT_COMMAND_LINE = "codex exec --skip-git-repo-check {{prompt}}";

export class CodexCliProvider extends BaseCliProvider {
  commandLine() {
    const commandLine = super.commandLine() || DEFAULT_COMMAND_LINE;
    if (commandLine.startsWith("codex exec ") && !commandLine.includes("--skip-git-repo-check")) {
      return commandLine.replace(/^codex\s+exec\s+/, "codex exec --skip-git-repo-check ");
    }
    return commandLine;
  }

  healthCheckCommand() {
    return ["codex", "login", "status"];
  }
}
