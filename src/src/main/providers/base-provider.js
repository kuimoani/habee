import { inspect } from "node:util";

export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  async call() {
    throw new Error("Provider call is not implemented.");
  }

  async healthCheck() {
    throw new Error("Provider health check is not implemented.");
  }

  timeoutMs() {
    return Number(this.config.timeoutMs || DEFAULT_TIMEOUT_MS);
  }
}

export function rawErrorMessage(error) {
  if (typeof error === "string") return error;
  return inspect(plainError(error), {
    depth: 10,
    colors: false,
    compact: false,
    breakLength: 120,
    maxArrayLength: 100,
    maxStringLength: 20000
  });
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("aborted");
}

function plainError(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  const output = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    try {
      output[key] = plainError(value[key], seen);
    } catch (error) {
      output[key] = `[Unreadable: ${error?.message || String(error)}]`;
    }
  }

  for (const key of Object.getOwnPropertySymbols(value)) {
    try {
      output[key.toString()] = plainError(value[key], seen);
    } catch (error) {
      output[key.toString()] = `[Unreadable: ${error?.message || String(error)}]`;
    }
  }

  if (value instanceof Error) {
    output.name = value.name;
    output.message = value.message;
    output.stack = value.stack;
  }

  return output;
}
