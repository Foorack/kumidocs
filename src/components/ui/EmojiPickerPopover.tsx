/**
 * EmojiPickerPopover — wraps the custom EmojiPicker in a Radix Popover.
 *
 * Renders the trigger as a button (visible only in edit mode) around a EmojiIcon.
 * The picker renders all emojis via EmojiIcon (bundled Fluent Emoji SVGs).
 */
import { useState, useCallback } from 'react';
import { Popover } from 'radix-ui';
import { EmojiPicker } from './EmojiPicker';
import { EmojiIcon } from './EmojiIcon';
import { cn } from '../../lib/utils';
import type { FileType } from '@/lib/types';

interface EmojiPickerPopoverProps {
	/** Currently selected emoji (undefined = use fileType default). */
	emoji?: string;
	/** Fallback icon type when no emoji is set. */
	fileType?: FileType;
	/** Size passed to EmojiIcon. Default: 24. */
	size?: number;
	/** Called with the new emoji character when the user picks one. */
	onSelect: (emoji: string) => void;
	/** When false the trigger is non-interactive (view mode). Default: true. */
	editable?: boolean;
	className?: string;
}

export function EmojiPickerPopover({
	emoji,
	fileType,
	size = 24,
	onSelect,
	editable = true,
	className,
}: EmojiPickerPopoverProps) {
	const [open, setOpen] = useState(false);

	const handleSelect = useCallback(
		(native: string) => {
			onSelect(native);
			setOpen(false);
		},
		[onSelect],
	);

	const icon = <EmojiIcon emoji={emoji} fileType={fileType} size={size} />;

	if (!editable) return icon;

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					aria-label="Change page emoji"
					className={cn(
						'flex rounded p-0.5 transition-colors',
						'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
				>
					{icon}
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content side="bottom" align="start" sideOffset={6} className="z-50">
					<EmojiPicker onEmojiSelect={handleSelect} autoFocus />
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
