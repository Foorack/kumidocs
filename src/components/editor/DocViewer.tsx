import { memo } from 'react';
import { Viewer } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/github-dark.css';
import { useTheme } from '../../store/theme';

const plugins = [gfm(), highlight()];

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	const { theme } = useTheme();

	return (
		<div
			className="bytemd-viewer prose prose-sm max-w-none dark:prose-invert px-8 py-6"
			data-color-mode={theme}
		>
			<Viewer value={value} plugins={plugins} />
		</div>
	);
});
