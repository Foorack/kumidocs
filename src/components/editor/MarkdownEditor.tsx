import { useCallback, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { DocViewer } from './DocViewer';

// ── Toolbar action helpers ────────────────────────────────────────────────────

/** Wrap the current selection (or insert at cursor) with `before` and `after`. */
function insertWrap(ta: HTMLTextAreaElement, before: string, after: string) {
	const start = ta.selectionStart;
	const end = ta.selectionEnd;
	const selected = ta.value.slice(start, end);
	ta.setRangeText(before + selected + after, start, end, 'preserve');
	// Position cursor: inside wrappers if no selection, around selection if there was one.
	if (selected.length > 0) {
		ta.setSelectionRange(start + before.length, start + before.length + selected.length);
	} else {
		ta.setSelectionRange(start + before.length, start + before.length);
	}
	ta.focus();
}

/** Set (or clear) a line prefix like `> ` or `## ` on the line at cursor. */
function setLinePrefix(ta: HTMLTextAreaElement, prefix: string) {
	const start = ta.selectionStart;
	const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
	const lineEndRaw = ta.value.indexOf('\n', start);
	const lineEnd = lineEndRaw === -1 ? ta.value.length : lineEndRaw;
	const line = ta.value.slice(lineStart, lineEnd);
	// Strip any existing heading/blockquote prefix.
	const stripped = line.replace(/^(#{1,6} |> )/, '');
	const newLine = prefix ? `${prefix}${stripped}` : stripped;
	ta.setRangeText(newLine, lineStart, lineEnd, 'preserve');
	ta.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length);
	ta.focus();
}

// ── Cheatsheet content ────────────────────────────────────────────────────────

const CHEATSHEET_ROWS: [string, string][] = [
	['# Heading 1', 'H1'],
	['## Heading 2', 'H2'],
	['**bold**', 'Bold'],
	['*italic*', 'Italic'],
	['> blockquote', 'Blockquote'],
	['`inline code`', 'Inline code'],
	['```\\ncode block\\n```', 'Code block'],
	['[text](url)', 'Link'],
	['![alt](url)', 'Image'],
	['- item', 'Unordered list'],
	['1. item', 'Ordered list'],
	['- [ ] task', 'Task list'],
	['---', 'Horizontal rule'],
	['| A | B |\\n|---|---|\\n| 1 | 2 |', 'Table'],
];

// ── Component ─────────────────────────────────────────────────────────────────

interface MarkdownEditorProps {
	value: string;
	onChange: (val: string) => void;
	onSave?: () => void;
	disabled?: boolean;
}

const HEADING_OPTIONS = [
	{ value: 'normal', label: 'Normal', prefix: '' },
	{ value: 'h1', label: 'Heading 1', prefix: '#' },
	{ value: 'h2', label: 'Heading 2', prefix: '##' },
	{ value: 'h3', label: 'Heading 3', prefix: '###' },
	{ value: 'h4', label: 'Heading 4', prefix: '####' },
	{ value: 'h5', label: 'Heading 5', prefix: '#####' },
	{ value: 'h6', label: 'Heading 6', prefix: '######' },
];

export function MarkdownEditor({ value, onChange, onSave, disabled }: MarkdownEditorProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const previewRef = useRef<HTMLDivElement>(null);
	const [headingValue, setHeadingValue] = useState('normal');
	const [helpOpen, setHelpOpen] = useState(false);

	// Dispatch a synthetic change so React picks up imperative textarea edits.
	const syncChange = useCallback(() => {
		if (taRef.current) onChange(taRef.current.value);
	}, [onChange]);

	const handleHeading = useCallback(
		(val: string) => {
			setHeadingValue(val);
			const opt = HEADING_OPTIONS.find((o) => o.value === val);
			if (!opt || !taRef.current) return;
			setLinePrefix(taRef.current, opt.prefix ? `${opt.prefix} ` : '');
			syncChange();
		},
		[syncChange],
	);

	const handleBold = useCallback(() => {
		if (!taRef.current) return;
		insertWrap(taRef.current, '**', '**');
		syncChange();
	}, [syncChange]);

	const handleItalic = useCallback(() => {
		if (!taRef.current) return;
		insertWrap(taRef.current, '*', '*');
		syncChange();
	}, [syncChange]);

	const handleQuote = useCallback(() => {
		if (!taRef.current) return;
		setLinePrefix(taRef.current, '> ');
		syncChange();
	}, [syncChange]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				onSave?.();
			}
		},
		[onSave],
	);

	const handleEditorScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
		const ta = e.currentTarget;
		const preview = previewRef.current;
		if (!preview) return;
		const scrollable = ta.scrollHeight - ta.clientHeight;
		if (scrollable <= 0) return;
		preview.scrollTop = (ta.scrollTop / scrollable) * (preview.scrollHeight - preview.clientHeight);
	}, []);

	return (
		<div className="flex flex-col h-full">
			{/* ── Toolbar ── */}
			<div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-background shrink-0">
				{/* Left: formatting controls */}
				<div className="flex items-center gap-1">
					<Select value={headingValue} onValueChange={handleHeading} disabled={disabled}>
						<SelectTrigger size="sm" className="w-32 h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{HEADING_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value} className="text-xs">
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="w-px h-4 bg-border mx-0.5" />

					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0 font-bold"
						onClick={handleBold}
						disabled={disabled}
						title="Bold (Ctrl+B)"
					>
						B
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0 italic"
						onClick={handleItalic}
						disabled={disabled}
						title="Italic (Ctrl+I)"
					>
						I
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0 font-serif text-base leading-none"
						onClick={handleQuote}
						disabled={disabled}
						title="Blockquote"
					>
						"
					</Button>
				</div>

				{/* Right: meta controls */}
				<div className="flex items-center gap-1">
					<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
						<DialogTrigger asChild>
							<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
								<span className="text-muted-foreground">?</span>
								Cheatsheet
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-lg">
							<DialogHeader>
								<DialogTitle>Markdown Cheatsheet</DialogTitle>
							</DialogHeader>
							<div className="text-xs space-y-1 mt-2">
								{CHEATSHEET_ROWS.map(([syntax, label]) => (
									<div
										key={label}
										className="flex items-start gap-3 py-1 border-b border-border/50 last:border-0"
									>
										<code className="flex-1 font-mono text-muted-foreground whitespace-pre-wrap">
											{syntax}
										</code>
										<span className="text-foreground shrink-0 w-28 text-right">
											{label}
										</span>
									</div>
								))}
							</div>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{/* ── Two-pane content ── */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left — editor */}
				<div className="flex-1 min-w-0 flex flex-col border-r border-border overflow-hidden">
					<textarea
						ref={taRef}
						value={value}
						onChange={(e) => {
							onChange(e.target.value);
						}}
					onScroll={handleEditorScroll}
						onKeyDown={handleKeyDown}
						disabled={disabled}
						spellCheck
						className="flex-1 resize-none outline-none bg-background text-foreground font-mono text-sm leading-relaxed p-6 overflow-y-auto placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
						placeholder="Start writing…"
					/>
				</div>

				{/* Right — live preview */}
				<div ref={previewRef} className="flex-1 min-w-0 overflow-y-auto">
					<DocViewer value={value} />
				</div>
			</div>
		</div>
	);
}
