import { Editor } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/github-dark.css';

const plugins = [gfm(), highlight()];

interface MarkdownEditorProps {
	value: string;
	onChange: (val: string) => void;
	onSave?: () => void;
	disabled?: boolean;
}

export function MarkdownEditor({ value, onChange, onSave, disabled }: MarkdownEditorProps) {
	return (
		<div className="bytemd-wrapper flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>
			<Editor
				value={value}
				plugins={plugins}
				onChange={onChange}
				editorConfig={{
					readOnly: disabled,

					keyMap: {
						'Ctrl-S': () => onSave?.(),
						'Cmd-S': () => onSave?.(),
					} as any,
				}}
			/>
		</div>
	);
}
