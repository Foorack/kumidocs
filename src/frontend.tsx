import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const elemOrNull = document.getElementById('root');
if (!elemOrNull) throw new Error('Root element #root not found in document');
const elem = elemOrNull;

const app = (
	<StrictMode>
		<App />
	</StrictMode>
);

// import.meta.hot is available in Bun dev (HMR) mode; undefined after production bundling
interface HotData {
	root?: ReturnType<typeof createRoot>;
}
interface BunHot {
	data: HotData;
}
const hot = import.meta.hot as BunHot | undefined;
if (hot) {
	const root = (hot.data.root ??= createRoot(elem));
	root.render(app);
} else {
	createRoot(elem).render(app);
}
