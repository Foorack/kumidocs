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

// ── Arg definitions ───────────────────────────────────────────────────────────
// To add a new config option: add one entry here. Everything else is automatic.

interface ArgDef {
	flags: string[];
	key: keyof Config;
	type: 'string' | 'number';
	env: string;
	default: string | number | (() => string | number);
	description: string;
}

function resolveDefault(def: ArgDef): string | number {
	return typeof def.default === 'function' ? def.default() : def.default;
}

function parse(def: ArgDef, raw: string): string | number {
	if (def.type === 'number') {
		const n = Number(raw);
		if (!Number.isFinite(n)) {
			console.error(`Error: ${String(def.flags[0])} expects a number, got: ${JSON.stringify(raw)}`);
			process.exit(1);
		}
		return n;
	}
	return raw;
}

const DEFS: ArgDef[] = [
	{
		flags: ['--repo'],
		key: 'repoPath',
		type: 'string',
		env: 'KUMIDOCS_REPO_PATH',
		default: () => process.cwd(),
		description: 'Path to git repository',
	},
	{
		flags: ['--port', '-p'],
		key: 'port',
		type: 'number',
		env: 'KUMIDOCS_PORT',
		default: 3000,
		description: 'Port to listen on',
	},
	{
		flags: ['--name'],
		key: 'instanceName',
		type: 'string',
		env: 'KUMIDOCS_INSTANCE_NAME',
		default: 'KumiDocs',
		description: 'Instance display name',
	},
	{
		flags: ['--auth-header'],
		key: 'authHeader',
		type: 'string',
		env: 'KUMIDOCS_AUTH_HEADER',
		default: 'X-Auth-Request-User',
		description: 'Request header carrying the user identity',
	},
	{
		flags: ['--auto-save-delay'],
		key: 'autoSaveDelay',
		type: 'number',
		env: 'KUMIDOCS_AUTO_SAVE_DELAY',
		default: 5000,
		description: 'Auto-save debounce delay in ms',
	},
	{
		flags: ['--pull-interval'],
		key: 'pullInterval',
		type: 'number',
		env: 'KUMIDOCS_PULL_INTERVAL',
		default: 60000,
		description: 'Background git pull interval in ms',
	},
];

// ── Help / version ────────────────────────────────────────────────────────────

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
	for (const def of DEFS) {
		const flagStr = def.flags.join(', ').padEnd(22);
		const dflt = resolveDefault(def);
		lines.push(`  ${flagStr} ${def.description} (default: ${String(dflt)}, env: ${def.env})`);
	}
	lines.push('  -h, --help               Show this help');
	lines.push('  -v, --version            Show version');
	console.log(lines.join('\n'));
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function getConfig(): Config {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printHelp();
		process.exit(0);
	}
	if (args.includes('--version') || args.includes('-v')) {
		console.log(pkg.version);
		process.exit(0);
	}

	const result: Partial<Config> = {};

	// Named flags
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const def = DEFS.find((d) => d.flags.includes(arg ?? ''));
		if (def) {
			const val = args[i + 1];
			if (val === undefined || val.startsWith('-')) {
				console.error(`Error: ${String(def.flags[0])} requires a value.`);
				process.exit(1);
			}
			const parsed = def.key === 'repoPath' ? resolve(val) : parse(def, val);
			(result as Record<string, string | number>)[def.key] = parsed;
			i++;
			continue;
		}
		// Bare positional → repo path
		if (arg && !arg.startsWith('-') && result.repoPath === undefined) {
			result.repoPath = resolve(arg);
		}
	}

	// Resolve each value: CLI → ENV → default
	const config: Partial<Config> = {};
	for (const def of DEFS) {
		const set = (v: string | number) =>
			((config as Record<string, string | number>)[def.key] = v);
		const cli = result[def.key];
		const env = process.env[def.env];
		if (cli !== undefined) set(cli);
		else if (env !== undefined) set(parse(def, env));
		else set(resolveDefault(def));
	}

	return config as Config;
}
