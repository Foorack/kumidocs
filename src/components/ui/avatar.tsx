import { avatarColor, avatarInitials } from "@/lib/avatar";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import cn from "@/lib/utils";
import { sha256 } from "@noble/hashes/sha2.js";
import { useMemo } from "react";

type AvatarSize = "xxs" | "xs" | "sm" | "md" | "lg";

const sizeMap: Record<AvatarSize, { circle: string; text: string }> = {
  lg: { circle: "h-10 w-10", text: "text-xs" },
  md: { circle: "h-7 w-7", text: "text-[10px]" },
  sm: { circle: "h-6 w-6", text: "text-[9px]" },
  xs: { circle: "h-[18px] w-[18px]", text: "text-[8px]" },
  xxs: { circle: "h-[11px] w-[11px]", text: "text-[4px]" },
};

const HEX_RADIX = 16;

interface UserAvatarProps extends ComponentProps<typeof AvatarPrimitive.Root> {
  /** Display name used for initials fallback and background color. */
  name: string;
  /** User email; Gravatar SHA-256 hash is computed internally. */
  email?: string;
  size?: AvatarSize;
  /** Whether to show a colored outline ring around the avatar. Default true. */
  outline?: boolean;
}

/** Compute a SHA-256 hex digest of a string; works in any context (no secure origin required). */
const sha256hex = (input: string): string => {
  const bytes = sha256(new TextEncoder().encode(input.trim().toLowerCase()));
  return [...bytes].map((byte) => byte.toString(HEX_RADIX).padStart(2, "0")).join("");
};

/**
 * A self-contained user avatar.
 * Shows a Gravatar photo when `email` is provided and a matching Gravatar exists;
 * otherwise shows coloured initials derived deterministically from `name`.
 * The Gravatar hash is computed client-side via SHA-256; never sent over the network.
 *
 * Usage:
 *   <UserAvatar name="Jane Doe" size="sm" />
 *   <UserAvatar name={user.displayName} email={user.email} />
 */
const UserAvatar = (allProps: UserAvatarProps): JSX.Element => {
  const { name, email, size = "md", outline = true, className, ...rest } = allProps;
  const { circle, text } = sizeMap[size];
  const displayInitials = avatarInitials(name);
  const color = avatarColor(name);
  const gravatarHash = useMemo((): string | undefined => {
    if (email === undefined || email === "") {
      return undefined;
    }
    if (!email.includes("@")) {
      return undefined;
    }
    return sha256hex(email);
  }, [email]);

  return (
    <AvatarPrimitive.Root
      {...rest}
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full select-none",
        circle,
        className,
      )}
      style={outline ? { outline: `2px solid ${color}`, outlineOffset: "1px" } : undefined}
    >
      {gravatarHash !== undefined && gravatarHash !== "" && (
        <AvatarPrimitive.Image
          className="aspect-square size-full"
          src={`/api/avatar/${gravatarHash}`}
          alt={name}
        />
      )}
      <AvatarPrimitive.Fallback
        className={cn(
          "flex size-full items-center justify-center rounded-full font-bold text-white",
          text,
        )}
        style={{ backgroundColor: color }}
      >
        {displayInitials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
};

export type { UserAvatarProps };
export { UserAvatar };
