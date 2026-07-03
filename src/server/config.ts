import path from "node:path";
import pkg from "@root/package.json";
import { runtimeEnv } from "./runtime";

// ExitRequest - thrown instead of process.exit() for clean exit handling
class ExitRequestError extends Error {
  public readonly exitCode: number;
  public constructor(exitCode: number) {
    super("Exit requested");
    this.name = "ExitRequestError";
    this.exitCode = exitCode;
  }
}

interface Config {
  repoPath: string;
  port: number;
  authHeader: string;
  autoSaveDelay: number;
  pullInterval: number;
  rateLimit: { count: number; windowMs: number };
  readonly: boolean;
}

// Option definitions
// To add a new config option: add one entry here. Everything else is automatic.

interface OptionDef {
  /** CLI flags in preference order, e.g. ['--port', '-p'] */
  flags: string[];
  /** Corresponding key in Config */
  key: keyof Config;
  /** Parse and validate a raw string into the typed value. Call fatal() on bad input. */
  coerce: (raw: string) => Config[keyof Config];
  /** Environment variable name */
  env: string;
  /** Static default, or a thunk for values computed at startup (e.g. process.cwd()). */
  default: Config[keyof Config] | (() => Config[keyof Config]);
  /** One-line description used in --help output. */
  description: string;
  /** When false, the flag takes no value; presence alone sets it to true. */
  needsValue?: boolean;
}

// Coercers

const PORT_MAX = 65_535;

const fatal = (message: string): never => {
  throw new Error(message);
};

const coercePort = (raw: string): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PORT_MAX) {
    fatal(`--port expects an integer 1-65535, got: ${JSON.stringify(raw)}`);
  }
  return parsed;
};

const coerceMs = (flag: string, raw: string): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fatal(`${flag} expects a non-negative integer (ms), got: ${JSON.stringify(raw)}`);
  }
  return parsed;
};

const coerceBool = (raw: string): boolean => {
  const lower = raw.trim().toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") {
    return true;
  }
  if (lower === "false" || lower === "0" || lower === "no") {
    return false;
  }
  fatal(`Expected a boolean (true/false/1/0/yes/no), got: ${JSON.stringify(raw)}`);
  return false;
};

// Options table

const OPTIONS: OptionDef[] = [
  {
    coerce: path.resolve,
    default: () => process.cwd(),
    description: "Path to git repository",
    env: "KUMIDOCS_REPO_PATH",
    flags: ["--repo"],
    key: "repoPath",
  },
  {
    coerce: coercePort,
    default: 5864,
    description: "Port to listen on",
    env: "KUMIDOCS_PORT",
    flags: ["--port", "-p"],
    key: "port",
  },
  {
    coerce: String,
    default: "X-Auth-Request-User",
    description: "Request header carrying the user identity",
    env: "KUMIDOCS_AUTH_HEADER",
    flags: ["--auth-header"],
    key: "authHeader",
  },
  {
    coerce: (value) => coerceMs("--auto-save-delay", value),
    default: 5000,
    description: "Auto-save debounce delay in ms",
    env: "KUMIDOCS_AUTO_SAVE_DELAY",
    flags: ["--auto-save-delay"],
    key: "autoSaveDelay",
  },
  {
    coerce: (value) => coerceMs("--pull-interval", value),
    default: 60_000,
    description: "Background git pull interval in ms",
    env: "KUMIDOCS_PULL_INTERVAL",
    flags: ["--pull-interval"],
    key: "pullInterval",
  },
  {
    coerce: (raw) => {
      // Format: "count/window_ms" e.g. "30/10000"
      const parts = raw.split("/");
      if (parts.length !== 2) {
        fatal(`KUMIDOCS_RATE_LIMIT expects format "count/window_ms", got: ${JSON.stringify(raw)}`);
      }
      const count = Number(parts[0]);
      const windowMs = Number(parts[1]);
      if (!Number.isInteger(count) || count < 1) {
        fatal(
          `KUMIDOCS_RATE_LIMIT count must be a positive integer, got: ${JSON.stringify(parts[0])}`,
        );
      }
      if (!Number.isInteger(windowMs) || windowMs < 1000) {
        fatal(
          `KUMIDOCS_RATE_LIMIT window must be at least 1000ms, got: ${JSON.stringify(parts[1])}`,
        );
      }
      return { count, windowMs };
    },
    default: { count: 30, windowMs: 10_000 },
    description: "Rate limit: 'count/window_ms' (e.g. 30/10000)",
    env: "KUMIDOCS_RATE_LIMIT",
    flags: ["--rate-limit"],
    key: "rateLimit",
  },
  {
    coerce: coerceBool,
    default: false,
    description: "Prevent all file edits and git modifications",
    env: "KUMIDOCS_READONLY",
    flags: ["--readonly"],
    key: "readonly",
    needsValue: false,
  },
];

// Help / version

const defaultValue = (opt: OptionDef): Config[keyof Config] => {
  if (typeof opt.default === "function") {
    return opt.default();
  }
  return opt.default;
};

const FLAG_COLUMN_WIDTH = 22;

const printHelp = (): void => {
  const lines = [
    `kumidocs v${pkg.version}: ${pkg.description}`,
    "",
    "Usage:",
    "  bunx kumidocs [repo] [options]",
    "",
    "Arguments:",
    "  repo                     Path to git repository (same as --repo)",
    "",
    "Options:",
  ];
  for (const opt of OPTIONS) {
    const flagStr = opt.flags.join(", ").padEnd(FLAG_COLUMN_WIDTH);
    const rawDefault = defaultValue(opt);
    const defaultStr =
      typeof rawDefault === "object"
        ? `${(rawDefault as { count: number }).count}/${(rawDefault as { windowMs: number }).windowMs}`
        : String(rawDefault);
    lines.push(`  ${flagStr} ${opt.description} (default: ${defaultStr}, env: ${opt.env})`);
  }
  lines.push(
    "  -h, --help               Show this help",
    "  -v, --version            Show version",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
};

// Parser

// opt.coerce return type is correct at runtime; confine unsoundness here.
const setConfigKey = (config: Config, key: keyof Config, value: Config[keyof Config]): void => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  (config as Record<keyof Config, Config[keyof Config]>)[key] = value;
};

const applyEnv = (opt: OptionDef, envValue: string | undefined): Config[keyof Config] => {
  if (envValue !== undefined && envValue !== "") {
    return opt.coerce(envValue);
  }
  return defaultValue(opt);
};

const loadConfig = (): Config => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    throw new ExitRequestError(0);
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${pkg.version}\n`);
    throw new ExitRequestError(0);
  }

  const cliOverrides: Partial<Config> = {};

  for (let argIdx = 0; argIdx < args.length; argIdx += 1) {
    const arg = args[argIdx];
    const opt = OPTIONS.find((option) => option.flags.includes(arg ?? ""));
    if (opt) {
      if (opt.needsValue === false) {
        // Boolean flags: presence alone sets the value to true
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        (cliOverrides as Record<keyof Config, Config[keyof Config]>)[opt.key] =
          true as Config[keyof Config];
      } else {
        const raw = args.at(argIdx + 1) ?? "";
        if (raw === "") {
          fatal(`${String(opt.flags.at(0))} requires a value.`);
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        (cliOverrides as Record<keyof Config, Config[keyof Config]>)[opt.key] = opt.coerce(raw);
        argIdx += 1;
      }
    } else if (
      arg !== undefined &&
      arg !== "" &&
      !arg.startsWith("-") &&
      (cliOverrides.repoPath === undefined || cliOverrides.repoPath === "")
    ) {
      // Bare positional argument - treat as --repo
      cliOverrides.repoPath = path.resolve(arg);
    }
  }

  // Merge: CLI > ENV > default
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const config = {} as Config;
  for (const opt of OPTIONS) {
    const cli = cliOverrides[opt.key];
    setConfigKey(config, opt.key, cli ?? applyEnv(opt, runtimeEnv[opt.env]));
  }
  return config;
};

export type { Config };
export { ExitRequestError, loadConfig };
