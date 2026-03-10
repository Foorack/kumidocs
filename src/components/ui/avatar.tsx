import * as React from 'react';
import { useMemo } from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { sha256 } from '@noble/hashes/sha2.js';
import { cn } from '@/lib/utils';
import { avatarColor, avatarInitials } from '@/lib/avatar';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeMap: Record<AvatarSize, { circle: string; text: string }> = {
	xs: { circle: 'h-[18px] w-[18px]', text: 'text-[8px]' },
	sm: { circle: 'h-6 w-6', text: 'text-[9px]' },
	md: { circle: 'h-7 w-7', text: 'text-[10px]' },
	lg: { circle: 'h-10 w-10', text: 'text-xs' },
};

export interface UserAvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
	/** Display name — used for initials fallback and background color. */
	name: string;
	/** User email — Gravatar SHA-256 hash is computed internally. */
	email?: string;
	size?: AvatarSize;
}

/** Compute a SHA-256 hex digest of a string — works in any context (no secure origin required). */
function sha256hex(input: string): string {
	const bytes = sha256(new TextEncoder().encode(input.trim().toLowerCase()));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * A self-contained user avatar.
 * Shows a Gravatar photo when `email` is provided and a matching Gravatar exists;
 * otherwise shows coloured initials derived deterministically from `name`.
 * The Gravatar hash is computed client-side via SHA-256 — never sent over the network.
 *
 * Usage:
 *   <UserAvatar name="Jane Doe" size="sm" />
 *   <UserAvatar name={user.displayName} email={user.email} />
 */
export function UserAvatar({ name, email, size = 'md', className, ...props }: UserAvatarProps) {
	const { circle, text } = sizeMap[size];
	const displayInitials = avatarInitials(name);
	const color = avatarColor(name);
	const gravatarHash = useMemo(() => (email?.includes('@') ? sha256hex(email) : null), [email]);

	return (
		<AvatarPrimitive.Root
			className={cn(
				'relative flex shrink-0 overflow-hidden rounded-full select-none',
				circle,
				className,
			)}
			style={{ outline: `2px solid ${color}`, outlineOffset: '1px' }}
			{...props}
		>
			{gravatarHash && (
				<AvatarPrimitive.Image
					className="aspect-square size-full"
					src={`/api/avatar/${gravatarHash}`}
					alt={name}
				/>
			)}
			<AvatarPrimitive.Fallback
				className={cn(
					'flex size-full items-center justify-center rounded-full font-bold text-white',
					text,
				)}
				style={{ backgroundColor: color }}
			>
				{displayInitials}
			</AvatarPrimitive.Fallback>
		</AvatarPrimitive.Root>
	);
}
