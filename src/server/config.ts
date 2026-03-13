import { resolve } from 'node:path';
import pkg from '../../package.json';

export interface Config {
	repoPath: string;
	port: number;
	authHeader: string;
	autoSaveDelay: number;
	instanceName: string;
	pullInterval: number;
}

// ── Option definitions ────────────────────────────────────────────────────────
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
}

// ── Coercers ──────────────────────────────────────────────────────────────────

function fatal(message: string): never {
	console.error(`Error: ${message}`);
	process.exit(1);
}

function coercePort(raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 65535)
		fatal(`--port expects an integer 1–65535, got: ${JSON.stringify(raw)}`);
	return n;
}

function coerceMs(flag: string, raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0)
		fatal(`${flag} expects a non-negative integer (ms), got: ${JSON.stringify(raw)}`);
	return n;
}

// ── Options table ─────────────────────────────────────────────────────────────

const OPTIONS: OptionDef[] = [
	{
		flags: ['--repo'],
		key: 'repoPath',
		coerce: resolve,
		env: 'KUMIDOCS_REPO_PATH',
		default: () => process.cwd(),
		description: 'Path to git repository',
	},
	{
		flags: ['--port', '-p'],
		key: 'port',
		coerce: coercePort,
		env: 'KUMIDOCS_PORT',
		default: 3000,
		description: 'Port to listen on',
	},
	{
		flags: ['--name'],
		key: 'instanceName',
		coerce: String,
		env: 'KUMIDOCS_INSTANCE_NAME',
		default: 'KumiDocs',
		description: 'Instance display name',
	},
	{
		flags: ['--auth-header'],
		key: 'authHeader',
		coerce: String,
		env: 'KUMIDOCS_AUTH_HEADER',
		default: 'X-Auth-Request-User',
		description: 'Request header carrying the user identity',
	},
	{
		flags: ['--auto-save-delay'],
		key: 'autoSaveDelay',
		coerce: (v) => coerceMs('--auto-save-delay', v),
		env: 'KUMIDOCS_AUTO_SAVE_DELAY',
		default: 5000,
		description: 'Auto-save debounce delay in ms',
	},
	{
		flags: ['--pull-interval'],
		key: 'pullInterval',
		coerce: (v) => coerceMs('--pull-interval', v),
		env: 'KUMIDOCS_PULL_INTERVAL',
		default: 60000,
		description: 'Background git pull interval in ms',
	},
];

// ── Help / version ────────────────────────────────────────────────────────────

function defaultValue(opt: OptionDef): Config[keyof Config] {
	return typeof opt.default === 'function' ? opt.default() : opt.default;
}

function printHelp(): void {
	const lines = [
		`kumidocs v${pkg.version} — ${pkg.description}`,
		'',
		'Usage:',
		'  bunx kumidocs [repo] [options]',
		'',
		'Arguments:',
		'  repo                     Path to git repository (same as --repo)',
		'',
		'Options:',
	];
	for (const opt of OPTIONS) {
		const flagStr = opt.flags.join(', ').padEnd(22);
		lines.push(
			`  ${flagStr} ${opt.description} (default: ${String(defaultValue(opt))}, env: ${opt.env})`,
		);
	}
	lines.push('  -h, --help               Show this help');
	lines.push('  -v, --version            Show version');
	console.log(lines.join('\n'));
}

// ── Parser ────────────────────────────────────────────────────────────────────

// TypeScript cannot verify that opt.coerce(raw) returns Config[K] for a specific
// key K at the call-site because it reasons over the union of all keys. The runtime
// is always correct; this cast confines the unsoundness to one place.
function setConfigKey(config: Config, key: keyof Config, value: Config[keyof Config]): void {
	(config as Record<keyof Config, Config[keyof Config]>)[key] = value;
}

export function loadConfig(): Config {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printHelp();
		process.exit(0);
	}
	if (args.includes('--version') || args.includes('-v')) {
		console.log(pkg.version);
		process.exit(0);
	}

	const cliOverrides: Partial<Config> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const opt = OPTIONS.find((o) => o.flags.includes(arg ?? ''));
		if (opt) {
			const raw = args[i + 1];
			if (raw === undefined) fatal(`${String(opt.flags[0])} requires a value.`);
			(cliOverrides as Record<keyof Config, Config[keyof Config]>)[opt.key] = opt.coerce(raw);
			i++;
			continue;
		}
		// Bare positional argument → treat as --repo
		if (arg && !arg.startsWith('-') && cliOverrides.repoPath === undefined) {
			cliOverrides.repoPath = resolve(arg);
		}
	}

	// Merge: CLI > ENV > default
	const config = {} as Config;
	for (const opt of OPTIONS) {
		const cli = cliOverrides[opt.key];
		const env = process.env[opt.env];
		setConfigKey(
			config,
			opt.key,
			cli ?? (env !== undefined ? opt.coerce(env) : defaultValue(opt)),
		);
	}
	return config;
}
