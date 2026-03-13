import { resolve } from 'node:path';

export interface Config {
	repoPath: string;
	port: number;
	authHeader: string;
	autoSaveDelay: number;
	instanceName: string;
	pullInterval: number;
}

/**
 * Parse CLI arguments.
 *
 * Supported flags:
 *   --repo <path>            Path to the git repository (default: cwd)
 *   --port <n>               Port to listen on (default: 3000)
 *   --name <str>             Instance display name (default: KumiDocs)
 *   --auth-header <str>      Header name carrying the user identity
 *   --auto-save-delay <n>    Debounce delay in ms before auto-save commit
 *   --pull-interval <n>      ms between background git pulls
 *
 * A bare positional argument is treated as --repo.
 */
function parseCliArgs(): Partial<Config> {
	const args = process.argv.slice(2);
	const result: Partial<Config> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case '--repo':
				result.repoPath = resolve(next ?? '');
				i++;
				break;
			case '--port':
			case '-p':
				result.port = parseInt(next ?? '', 10);
				i++;
				break;
			case '--name':
				result.instanceName = next ?? '';
				i++;
				break;
			case '--auth-header':
				result.authHeader = next ?? '';
				i++;
				break;
			case '--auto-save-delay':
				result.autoSaveDelay = parseInt(next ?? '', 10);
				i++;
				break;
			case '--pull-interval':
				result.pullInterval = parseInt(next ?? '', 10);
				i++;
				break;
			default:
				// Bare positional argument — treat as repo path
				if (!arg.startsWith('-') && !result.repoPath) {
					result.repoPath = resolve(arg);
				}
		}
	}

	return result;
}

export function getConfig(): Config {
	const cli = parseCliArgs();

	return {
		// Priority: CLI > ENV > default (cwd)
		repoPath: cli.repoPath ?? (process.env.KUMIDOCS_REPO_PATH ? resolve(process.env.KUMIDOCS_REPO_PATH) : process.cwd()),
		port: cli.port ?? parseInt(process.env.KUMIDOCS_PORT ?? '3000', 10),
		authHeader: cli.authHeader ?? process.env.KUMIDOCS_AUTH_HEADER ?? 'X-Auth-Request-User',
		autoSaveDelay: cli.autoSaveDelay ?? parseInt(process.env.KUMIDOCS_AUTO_SAVE_DELAY ?? '5000', 10),
		instanceName: cli.instanceName ?? process.env.KUMIDOCS_INSTANCE_NAME ?? 'KumiDocs',
		pullInterval: cli.pullInterval ?? parseInt(process.env.KUMIDOCS_PULL_INTERVAL ?? '60000', 10),
	};
}
