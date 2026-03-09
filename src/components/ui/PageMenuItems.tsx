import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
	AddRegular,
	CopyRegular,
	OpenRegular,
	LinkRegular,
	ArrowDownloadRegular,
} from '@fluentui/react-icons';
import { DropdownMenuItem, DropdownMenuSeparator } from './dropdown-menu';
import { ContextMenuItem, ContextMenuSeparator } from './context-menu';
import { Square } from 'lucide-react';

export interface PageMenuItemsProps {
	variant: 'dropdown' | 'context';
	/** Client-side href for navigation (e.g. /p/my-page) */
	href: string;
	/** Repo-relative file path (e.g. my-page.md) */
	path: string;
	displayTitle: string;
	isVirtual?: boolean;
	/** Parent directory path used for "New page alongside" */
	parentDir?: string;
	onNewSubPage?: (dir: string) => void;
	onNewPage?: (dir: string) => void;
	onDuplicate?: () => void;
	onExportPdf?: () => void;
	onMove?: (path: string) => void;
	onDelete?: (path: string, title: string) => void;
}

/** Standard page actions menu items, usable in both DropdownMenu and ContextMenu. */
export function PageMenuItems({
	variant,
	href,
	path,
	displayTitle,
	isVirtual = false,
	parentDir = '',
	onNewSubPage,
	onNewPage,
	onDuplicate,
	onExportPdf,
	onMove,
	onDelete,
}: PageMenuItemsProps) {
	// Reference the real components — no wrapper functions, stable across renders.
	const Item: typeof DropdownMenuItem =
		variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem;
	const Sep: typeof DropdownMenuSeparator =
		variant === 'dropdown' ? DropdownMenuSeparator : ContextMenuSeparator;

	if (isVirtual) {
		return (
			<Item asChild>
				<Link to={href}>Create this page</Link>
			</Item>
		);
	}

	const showCreateGroup = !!(onNewSubPage ?? onNewPage);
	const showDangerousGroup = !!(onMove ?? onDelete);

	return (
		<>
			{showCreateGroup && (
				<>
					{onNewSubPage && (
						<Item
							onClick={() => {
								onNewSubPage(path.replace(/\.md$/i, ''));
							}}
						>
							<AddRegular className="mr-2 w-4 h-4" />
							New subpage
						</Item>
					)}
					{onNewPage && (
						<Item
							onClick={() => {
								onNewPage(parentDir);
							}}
						>
							<Square className="mr-2 w-4 h-4 opacity-0" />
							New page
						</Item>
					)}
					{onDuplicate && (
						<Item onClick={onDuplicate}>
							<CopyRegular className="mr-2 w-4 h-4" />
							Duplicate
						</Item>
					)}
					<Sep />
				</>
			)}

			<Item
				onClick={() => {
					window.open(href, '_blank');
				}}
			>
				<OpenRegular className="mr-2 w-4 h-4" />
				Open in new tab
			</Item>
			<Item
				onClick={() => {
					void navigator.clipboard.writeText(window.location.origin + href).then(() => {
						toast.success('Link copied');
					});
				}}
			>
				<LinkRegular className="mr-2 w-4 h-4" />
				Copy link
			</Item>
			{onExportPdf && (
				<Item onClick={onExportPdf}>
					<ArrowDownloadRegular className="mr-2 w-4 h-4" />
					Export as PDF
				</Item>
			)}

			{showDangerousGroup && (
				<>
					<Sep />
					{onMove && (
						<Item
							onClick={() => {
								onMove(path);
							}}
						>
							<Square className="mr-2 w-4 h-4 opacity-0" />
							Move
						</Item>
					)}
					{onDelete && (
						<Item
							className="text-destructive focus:text-destructive"
							onClick={() => {
								onDelete(path, displayTitle);
							}}
						>
							<Square className="mr-2 w-4 h-4 opacity-0" />
							Delete
						</Item>
					)}
				</>
			)}
		</>
	);
}
