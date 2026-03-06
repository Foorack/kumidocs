import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import 'streamdown/styles.css';

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	return (
		<div className="prose prose-table:my-0 prose-pre:my-0 dark:prose-invert max-w-none px-8 py-6">
			<Streamdown plugins={{ code }}>{value}</Streamdown>
		</div>
	);
});
