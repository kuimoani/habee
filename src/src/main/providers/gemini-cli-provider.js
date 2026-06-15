import { BaseCliProvider } from "./base-cli-provider.js";

const DEFAULT_COMMAND_LINE = "gemini -p {{prompt}}";

export class GeminiCliProvider extends BaseCliProvider {
  commandLine() {
    return super.commandLine() || DEFAULT_COMMAND_LINE;
  }

  healthCheckCommand() {
    return ["gemini", "-p", "Hi"];
  }
}
