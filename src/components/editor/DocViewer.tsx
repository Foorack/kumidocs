import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { harden } from 'rehype-harden';
import { math } from '@streamdown/math';
import { memo } from 'react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	return (
		<div className="prose prose-table:my-0 prose-pre:my-0 prose-pre:bg-transparent dark:prose-invert max-w-none px-8 py-6">
			<Streamdown
				plugins={{
					cjk,
					code,
					math,
				}}
				shikiTheme={['github-light', 'github-dark']} // [light, dark]
				linkSafety={{ enabled: false }}
				// When overriding rehypePlugins, always include defaultRehypePlugins.sanitize
				// to preserve XSS protection. The rehypePlugins prop replaces the entire
				// default array — it does not merge.
				rehypePlugins={[
					// COMMENTED OUT TO DISABLE RAW HTML
					// // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					// defaultRehypePlugins.raw!,

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					defaultRehypePlugins.sanitize!,
					[
						harden,
						{
							allowedProtocols: ['https', 'mailto'],
						},
					],
				]}
			>
				{value}
			</Streamdown>
		</div>
	);
});
