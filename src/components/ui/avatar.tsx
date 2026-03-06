import * as React from 'react';
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
	/** Pre-computed initials override (e.g. from server). Falls back to avatarInitials(name). */
	initials?: string;
	/** MD5 hash of the user's email for Gravatar. If omitted or image fails, shows initials. */
	gravatarHash?: string;
	size?: AvatarSize;
}

/**
 * A self-contained user avatar.
 * Shows a Gravatar photo when `gravatarHash` is provided and a matching Gravatar exists;
 * otherwise shows coloured initials derived deterministically from `name`.
 *
 * Usage:
 *   <UserAvatar name="Jane Doe" size="sm" />
 *   <UserAvatar name={user.displayName} gravatarHash={user.gravatarHash} />
 */
export function UserAvatar({
	name,
	initials,
	gravatarHash,
	size = 'md',
	className,
	...props
}: UserAvatarProps) {
	const { circle, text } = sizeMap[size];
	const displayInitials = initials ?? avatarInitials(name);
	const color = avatarColor(name);

	return (
		<AvatarPrimitive.Root
			className={cn(
				'relative flex shrink-0 overflow-hidden rounded-full select-none',
				circle,
				className,
			)}
			{...props}
		>
			{gravatarHash && (
				<AvatarPrimitive.Image
					className="aspect-square size-full"
					src={`https://www.gravatar.com/avatar/${gravatarHash}?s=80&d=404`}
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
