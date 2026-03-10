import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { useTheme } from '../../store/theme';

interface CodeEditorProps {
	value: string;
	language: string; // raw file extension, e.g. "ts", "py", "json"
	readOnly?: boolean;
	onChange?: (value: string) => void;
	onSave?: () => void;
}

// Map raw file extensions to @uiw/codemirror-extensions-langs language names.
// Many extensions match directly (ts, js, py, rs, etc.), so only exceptions are listed.
const EXT_TO_LANG: Record<string, string> = {
	mjs: 'js',
	cjs: 'js',
	bash: 'sh',
	zsh: 'sh',
	fish: 'sh',
	htm: 'html',
	scss: 'sass',
	yml: 'yaml',
	jsonc: 'json',
	gql: 'graphql',
	kt: 'kotlin',
	kts: 'kotlin',
	tf: 'hcl',
	tfvars: 'hcl',
};

function resolveLanguage(ext: string) {
	const name = (EXT_TO_LANG[ext] ?? ext) as LanguageName;
	try {
		const lang = loadLanguage(name);
		return lang ? [lang] : [];
	} catch {
		return [];
	}
}

export function CodeEditor({
	value,
	language,
	readOnly = false,
	onChange,
	onSave,
}: CodeEditorProps) {
	const { theme } = useTheme();

	const extensions = [
		...resolveLanguage(language),
		EditorView.lineWrapping,
		// Ctrl+S / Cmd+S save shortcut
		...(onSave
			? [
					EditorView.domEventHandlers({
						keydown(e) {
							if ((e.ctrlKey || e.metaKey) && e.key === 's') {
								e.preventDefault();
								onSave();
							}
						},
					}),
				]
			: []),
	];

	return (
		<div className="h-full overflow-auto text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:min-h-full [&_.cm-editor.cm-focused]:outline-none">
			<CodeMirror
				value={value}
				height="100%"
				theme={theme === 'dark' ? githubDark : githubLight}
				extensions={extensions}
				readOnly={readOnly}
				basicSetup={{
					lineNumbers: true,
					foldGutter: true,
					highlightActiveLine: !readOnly,
					highlightSelectionMatches: true,
					autocompletion: false,
					closeBrackets: false,
				}}
				onChange={onChange}
			/>
		</div>
	);
}
