/**
 * DocViewer — renders Markdown into a sandboxed iframe.
 *
 * Security model:
 *   • XSS  — Streamdown's built-in rehype-harden strips all dangerous HTML /
 *             event-handler attributes before anything hits the DOM.
 *   • CSS   — Content is rendered inside a same-origin sandbox iframe so the
 *             host app's layout styles cannot bleed in and vice-versa.
 *
 * Sandbox flags:
 *   • allow-same-origin — lets the parent frame access contentDocument to
 *     inject styles and mount the React root.  No scripts run inside the
 *     iframe itself (allow-scripts is intentionally absent).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useTheme } from '../../store/theme';

// Minimal HTML written into the iframe on first load.
const BASE_SRCDOC = `<!doctype html>
<html>
<head><meta charset="UTF-8"></head>
<body><div id="root"></div></body>
</html>`;

/** Collect all CSSRules from the parent document's stylesheets as a string. */
function collectParentStyles(): string {
	return Array.from(document.styleSheets)
		.flatMap((sheet) => {
			try {
				return Array.from(sheet.cssRules).map((r) => r.cssText);
			} catch {
				// Cross-origin sheets are not readable — skip.
				return [];
			}
		})
		.join('\n');
}

function renderContent(value: string) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none px-8 py-6">
			<Streamdown>{value}</Streamdown>
		</div>
	);
}

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	const { theme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const rootRef = useRef<Root | null>(null);
	const roRef = useRef<ResizeObserver | null>(null);
	const [height, setHeight] = useState(0);
	const readyRef = useRef(false);

	// ── Initialise the iframe once on mount ────────────────────────────────
	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		const handleLoad = () => {
			const doc = iframe.contentDocument;
			if (!doc) return;

			// 1. Inject parent styles so Tailwind prose classes resolve.
			const styleEl = doc.createElement('style');
			styleEl.textContent = collectParentStyles();
			doc.head.appendChild(styleEl);

			// 2. Reset body margins; keep background transparent.
			const resetEl = doc.createElement('style');
			resetEl.textContent =
				'html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}';
			doc.head.appendChild(resetEl);

			// 3. Apply dark-mode class to the iframe's <html>.
			if (theme === 'dark') doc.documentElement.classList.add('dark');

			// 4. Mount React root and do the first render.
			// Guard against HMR re-mounts where the container already has a root.
			const container = doc.getElementById('root');
			if (!container) return;
			if (!rootRef.current) {
				rootRef.current = createRoot(container);
			}
			readyRef.current = true;
			rootRef.current.render(renderContent(value));

			// 5. Auto-size iframe height to content — no scrollbar needed.
			const win = iframe.contentWindow as (Window & typeof globalThis) | null;
			if (win?.ResizeObserver) {
				roRef.current = new win.ResizeObserver(() => {
					setHeight(doc.documentElement.scrollHeight);
				});
				roRef.current.observe(doc.body);
			}
		};

		iframe.addEventListener('load', handleLoad, { once: true });

		return () => {
			readyRef.current = false;
			roRef.current?.disconnect();
			roRef.current = null;
			// Capture and null the ref immediately so the next mount's guard
			// creates a fresh root, but defer the actual unmount call — React 18
			// throws a warning if you unmount synchronously during a render
			// pass (e.g. HMR hot-swap).
			const root = rootRef.current;
			rootRef.current = null;
			setTimeout(() => root?.unmount(), 0);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Re-render when markdown content changes ────────────────────────────
	useEffect(() => {
		if (!readyRef.current) return;
		rootRef.current?.render(renderContent(value));
	}, [value]);

	// ── Sync dark / light mode into the iframe ─────────────────────────────
	useEffect(() => {
		const doc = iframeRef.current?.contentDocument;
		if (!doc) return;
		if (theme === 'dark') {
			doc.documentElement.classList.add('dark');
		} else {
			doc.documentElement.classList.remove('dark');
		}
	}, [theme]);

	return (
		<iframe
			ref={iframeRef}
			srcDoc={BASE_SRCDOC}
			sandbox="allow-same-origin"
			className="w-full border-none block"
			style={{ height: height > 0 ? height : undefined, minHeight: 120 }}
			title="Document viewer"
		/>
	);
});

