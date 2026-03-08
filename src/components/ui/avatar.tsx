import * as React from 'react';
import { useState, useEffect } from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
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

/** Compute a SHA-256 hex digest of a string using the native Web Crypto API. */
async function sha256hex(input: string): Promise<string> {
	const encoded = new TextEncoder().encode(input.trim().toLowerCase());
	const buf = await crypto.subtle.digest('SHA-256', encoded);
	return Array.from(new Uint8Array(buf))
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
	const [gravatarHash, setGravatarHash] = useState<string | null>(null);

	useEffect(() => {
		if (!email) return;
		if (!email.includes('@')) return;
		sha256hex(email)
			.then(setGravatarHash)
			.catch(() => {
				/* silently fall back to initials */
			});
	}, [email]);

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
