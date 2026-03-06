import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import 'streamdown/styles.css';

const code = createCodePlugin({
  themes: ['github-light', 'github-dark'], // [light, dark]
});

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	return (
		<div className="prose prose-table:my-0 prose-pre:my-0 prose-pre:bg-transparent dark:prose-invert max-w-none px-8 py-6">
			<Streamdown plugins={{ code }}>{value}</Streamdown>
		</div>
	);
});
