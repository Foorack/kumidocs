import { useState, useEffect } from 'react';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ChevronRightRegular, DocumentRegular } from '@fluentui/react-icons';
import type { CommitEntry } from '../../lib/types';

interface DiffData {
	sha: string;
	message: string;
	author: string;
	date: string;
	unifiedDiff: string;
}

interface PageInfoPanelProps {
	filePath: string;
	title: string;
}

export function PageInfoPanel({ filePath, title }: PageInfoPanelProps) {
	const [commits, setCommits] = useState<CommitEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [diffOpen, setDiffOpen] = useState(false);
	const [diffData, setDiffData] = useState<DiffData | null>(null);
	const [diffLoading, setDiffLoading] = useState(false);

	useEffect(() => {
		fetch(`/api/file/history?path=${encodeURIComponent(filePath)}`)
			.then((r) => r.json() as Promise<CommitEntry[]>)
			.then((data) => {
				setCommits(data);
			})
			.catch(() => {
				setCommits([]);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [filePath]);

	const openDiff = (sha: string) => {
		setDiffLoading(true);
		setDiffOpen(true);
		setDiffData(null);
		fetch(`/api/file/diff?path=${encodeURIComponent(filePath)}&sha=${sha}`)
			.then((r) => r.json() as Promise<DiffData>)
			.then((data) => {
				setDiffData(data);
			})
			.catch(() => {
				setDiffData(null);
			})
			.finally(() => {
				setDiffLoading(false);
			});
	};

	return (
		<div className="w-72 shrink-0 border-l border-border bg-sidebar flex flex-col h-full overflow-hidden">
			<div className="px-3 py-2 border-b border-border shrink-0">
				<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
					<DocumentRegular className="w-4 h-4 shrink-0" />
					Page info
				</div>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-3 space-y-3">
					{/* Title + path */}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Title
						</p>
						<p className="text-sm text-foreground break-words">{title}</p>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Path
						</p>
						<p className="text-sm font-mono text-foreground break-all">{filePath}</p>
					</div>

					{/* Commit history */}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Commit history
						</p>
						{loading ? (
							<p className="text-xs text-muted-foreground py-2">Loading…</p>
						) : commits.length === 0 ? (
							<p className="text-xs text-muted-foreground py-2">No commits yet.</p>
						) : (
							<div className="space-y-0.5">
								{commits.map((c) => (
									<button
										key={c.sha}
										className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent/60 group flex items-start gap-1.5 transition-colors"
										onClick={() => {
											openDiff(c.sha);
										}}
									>
										<span className="font-mono text-muted-foreground shrink-0 mt-0.5">
											{c.sha}
										</span>
										<span className="flex-1 min-w-0">
											<span className="text-foreground line-clamp-2 block">
												{c.message}
											</span>
											<span className="text-muted-foreground block">
												{c.author} ·{' '}
												{new Date(c.date).toLocaleDateString(undefined, {
													month: 'short',
													day: 'numeric',
													year: 'numeric',
												})}
											</span>
										</span>
										<ChevronRightRegular className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity" />
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</ScrollArea>

			{/* Diff dialog */}
			<Dialog open={diffOpen} onOpenChange={setDiffOpen}>
				<DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0">
					<DialogHeader className="px-4 py-3 border-b border-border shrink-0">
						<DialogTitle className="text-sm font-semibold">
							{diffData ? (
								<>
									<span className="font-mono text-muted-foreground mr-2">
										{diffData.sha}
									</span>
									{diffData.message}
								</>
							) : (
								'Loading diff…'
							)}
						</DialogTitle>
						{diffData && (
							<p className="text-xs text-muted-foreground">
								{diffData.author} ·{' '}
								{new Date(diffData.date).toLocaleString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
								})}
							</p>
						)}
					</DialogHeader>
					<ScrollArea className="flex-1 min-h-0">
						<div className="p-4">
							{diffLoading && (
								<p className="text-sm text-muted-foreground py-4 text-center">
									Loading diff…
								</p>
							)}
							{!diffLoading &&
								diffData &&
								(() => {
									const files = parseDiff(diffData.unifiedDiff);
									if (files.length === 0) {
										return (
											<p className="text-sm text-muted-foreground py-4 text-center">
												No changes in this commit.
											</p>
										);
									}
									return files.map((file) => (
										<Diff
											key={`${file.oldRevision}-${file.newRevision}`}
											viewType="unified"
											diffType={file.type}
											hunks={file.hunks}
										>
											{(hunks) =>
												hunks.map((hunk) => (
													<Hunk key={hunk.content} hunk={hunk} />
												))
											}
										</Diff>
									));
								})()}
							{!diffLoading && !diffData && (
								<p className="text-sm text-destructive py-4 text-center">
									Failed to load diff.
								</p>
							)}
						</div>
					</ScrollArea>
					<div className="px-4 py-2 border-t border-border shrink-0 flex justify-end">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setDiffOpen(false);
							}}
						>
							Close
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
