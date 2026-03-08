/**
 * Shared avatar utilities — used by both client components and server auth.
 *
 * These functions are imported by:
 *   - src/server/auth.ts                       (emailToDisplayName for User.displayName)
 *   - src/components/layout/PageInfoPanel.tsx  (commit history avatars)
 *   - src/components/ui/avatar.tsx             (initials fallback when no Gravatar)
 */

/** Derive a display name from an email address.
 *  "max.faxalv@example.com" → "Max Faxalv"
 *  "max@foorack.com"     → "Max"
 */
export function emailToDisplayName(email: string): string {
	const local = email.split('@')[0] ?? email;
	return local
		.split('.')
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
		.join(' ')
		.trim();
}

/** djb2-style hash of name → deterministic HSL background color. */
export function avatarColor(name: string): string {
	let hash = 1;
	for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue.toString()}, 60%, 42%)`;
}

/**
 * Returns 1–2 uppercase initials for a display name.
 *
 * - Multi-word  → first char of first word + first char of last word  ("Jane Doe" → "JD")
 * - Single word → first two chars of the word                         ("Foorack"  → "FO")
 */
export function avatarInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
	}
	return (name.slice(0, 2) || '?').toUpperCase();
}
