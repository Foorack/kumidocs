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
	parse: (v: string) => string | number;
	env: string;
	defaultFn: () => string | number;
	helpDefault: string;
	description: string;
}

const DEFS: ArgDef[] = [
	{
		flags: ['--repo'],
		key: 'repoPath',
		parse: (v) => resolve(v),
		env: 'KUMIDOCS_REPO_PATH',
		defaultFn: () => process.cwd(),
		helpDefault: 'cwd',
		description: 'Path to git repository',
	},
	{
		flags: ['--port', '-p'],
		key: 'port',
		parse: Number,
		env: 'KUMIDOCS_PORT',
		defaultFn: () => 3000,
		helpDefault: '3000',
		description: 'Port to listen on',
	},
	{
		flags: ['--name'],
		key: 'instanceName',
		parse: String,
		env: 'KUMIDOCS_INSTANCE_NAME',
		defaultFn: () => 'KumiDocs',
		helpDefault: 'KumiDocs',
		description: 'Instance display name',
	},
	{
		flags: ['--auth-header'],
		key: 'authHeader',
		parse: String,
		env: 'KUMIDOCS_AUTH_HEADER',
		defaultFn: () => 'X-Auth-Request-User',
		helpDefault: 'X-Auth-Request-User',
		description: 'Request header carrying the user identity',
	},
	{
		flags: ['--auto-save-delay'],
		key: 'autoSaveDelay',
		parse: Number,
		env: 'KUMIDOCS_AUTO_SAVE_DELAY',
		defaultFn: () => 5000,
		helpDefault: '5000',
		description: 'Auto-save debounce delay in ms',
	},
	{
		flags: ['--pull-interval'],
		key: 'pullInterval',
		parse: Number,
		env: 'KUMIDOCS_PULL_INTERVAL',
		defaultFn: () => 60000,
		helpDefault: '60000',
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
		lines.push(`  ${flagStr} ${def.description} (default: ${def.helpDefault}, env: ${def.env})`);
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
			if (val !== undefined) {
				(result as Record<string, string | number>)[def.key] = def.parse(val);
				i++;
			}
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
		else if (env !== undefined) set(def.parse(env));
		else set(def.defaultFn());
	}

	return config as Config;
}
