export interface Config {
	repoPath: string;
	port: number;
	authHeader: string;
	autoSaveDelay: number;
	instanceName: string;
	pullInterval: number;
}

export function getConfig(): Config {
	const repoPath = process.env.KUMIDOCS_REPO_PATH;
	if (!repoPath) {
		console.error('Fatal: KUMIDOCS_REPO_PATH environment variable is required.');
		console.error('Set it to the absolute path of your git repository.');
		process.exit(1);
	}
	return {
		repoPath,
		port: parseInt(process.env.KUMIDOCS_PORT ?? '3000', 10),
		authHeader: process.env.KUMIDOCS_AUTH_HEADER ?? 'X-Auth-Request-User',
		autoSaveDelay: parseInt(process.env.KUMIDOCS_AUTO_SAVE_DELAY ?? '5000', 10),
		instanceName: process.env.KUMIDOCS_INSTANCE_NAME ?? 'KumiDocs',
		pullInterval: parseInt(process.env.KUMIDOCS_PULL_INTERVAL ?? '60000', 10),
	};
}
