import { serve } from 'bun';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import index from './index.html';
import { getConfig } from './server/config';
import { parseUser, setPermissions } from './server/auth';
import type { KumiDocsPermissions } from './server/auth';
import { loadFilestore } from './server/filestore';
import { initSearch, rebuildIndex } from './server/search';
import { gitPull, gitFetchAndRebase, gitStageAndCommit } from './server/git';
import {
	wsOpen,
	wsMessage,
	wsClose,
	pruneDeadSessions,
	broadcastPageChanged,
	broadcastPageDeleted,
} from './server/websocket';
import { reloadFile, removeFromCache } from './server/filestore';
import {
	apiMe,
	apiTree,
	apiFileGet,
	apiFilePut,
	apiFileCreate,
	apiFileDelete,
	apiFileRename,
	apiSearch,
	apiSidebar,
	apiUploadImage,
	serveRepoAsset,
} from './server/api';
import type { WsData } from './server/websocket';

const config = getConfig();

// Validate repo
if (!existsSync(join(config.repoPath, '.git'))) {
	console.error(`Fatal: ${config.repoPath} is not a git repository.`);
	process.exit(1);
}

// Load .kumidocs.json permissions
async function loadPermissions() {
	const configPath = join(config.repoPath, '.kumidocs.json');
	try {
		const raw = await readFile(configPath, 'utf-8');
		setPermissions(JSON.parse(raw) as KumiDocsPermissions);
	} catch (err: unknown) {
		// If file doesn't exist, create it with default config
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			const defaultConfig = {
				instanceName: config.instanceName,
				editors: [],
			};
			await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
			setPermissions(defaultConfig);
			console.log('Created .kumidocs.json with default configuration');

			// Commit and push the new config file
			await gitStageAndCommit(
				config,
				['.kumidocs.json'],
				'chore: initialize .kumidocs.json',
				'KumiDocs',
				'kumidocs@localhost',
			);
			console.log('Committed and pushed .kumidocs.json to repository');
		} else {
			setPermissions({});
		}
	}
}

await loadPermissions();
await gitPull(config);
await loadFilestore(config);
initSearch();

// Auth helper used in route handlers
function requireUser(req: Request) {
	return parseUser(req.headers, config.authHeader);
}

// Background tasks
setInterval(() => {
	void (async () => {
		const result = await gitFetchAndRebase(config);
		if (result.advanced) {
			// Re-read changed files
			await loadPermissions();
			for (const changedPath of result.changed) {
				if (changedPath === '.kumidocs.json') continue;
				const fullPath = join(config.repoPath, changedPath);
				if (existsSync(fullPath)) {
					await reloadFile(changedPath, config);
					rebuildIndex();
					broadcastPageChanged(changedPath, result.sha, 'upstream', 'Remote');
				} else {
					removeFromCache(changedPath);
					rebuildIndex();
					broadcastPageDeleted(changedPath);
				}
			}
		}
	})();
}, config.pullInterval);

// Prune dead WS sessions every 30s
setInterval(pruneDeadSessions, 30_000);

const server = serve<WsData>({
	port: config.port,

	routes: {
		'/*': index,

		'/api/me': {
			GET(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiMe(user, config);
			},
		},

		'/api/tree': {
			GET(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiTree();
			},
		},

		'/api/sidebar': {
			GET(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiSidebar();
			},
		},

		'/api/file': {
			GET(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiFileGet(new URL(req.url), config);
			},
			async PUT(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiFilePut(new URL(req.url), req, user, config);
			},
			async POST(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiFileCreate(req, user, config);
			},
			async DELETE(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiFileDelete(new URL(req.url), user, config);
			},
		},

		'/api/file/rename': {
			async POST(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiFileRename(req, user, config);
			},
		},

		'/api/search': {
			GET(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiSearch(new URL(req.url));
			},
		},

		'/api/upload/image': {
			async POST(req: Request) {
				const user = requireUser(req);
				if (!user) return new Response('Unauthorized', { status: 401 });
				return apiUploadImage(req, user, config);
			},
		},
	},

	async fetch(req, server) {
		const url = new URL(req.url);

		// WebSocket upgrade
		if (url.pathname === '/ws') {
			const user = requireUser(req);
			if (!user) return new Response('Unauthorized', { status: 401 });
			const upgraded = server.upgrade(req, {
				data: {
					user,
					pageId: null,
					sessionId: '',
					lastHeartbeat: Date.now(),
				},
			});
			return upgraded ? undefined : new Response('WS upgrade failed', { status: 400 });
		}

		// Serve repo assets (images etc.)
		if (url.pathname.startsWith('/repo-asset/')) {
			const user = requireUser(req);
			if (!user) return new Response('Unauthorized', { status: 401 });
			const assetPath = decodeURIComponent(url.pathname.replace('/repo-asset/', ''));
			return serveRepoAsset(assetPath, config);
		}

		return undefined; // let routes handle it
	},

	websocket: {
		open: wsOpen,
		message: wsMessage,
		close: wsClose,
	},

	development: process.env.NODE_ENV !== 'production' && {
		hmr: true,
		console: true,
	},
});

console.log(`🚀 KumiDocs (${config.instanceName}) running at ${server.url}`);
console.log(`📁 Repo: ${config.repoPath}`);
