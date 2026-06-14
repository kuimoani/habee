import { BaseCliProvider } from "./base-cli-provider.js";

const DEFAULT_COMMAND_LINE = "claude -p {{prompt}}";

export class ClaudeCliProvider extends BaseCliProvider {
  commandLine() {
    return super.commandLine() || DEFAULT_COMMAND_LINE;
  }
}
