/**
 * Shared avatar utilities — used by both client components and server auth.
 *
 * RULES (must stay consistent everywhere):
 *   avatarInitials("Foorack")          → "FO"  (single word → first 2 chars)
 *   avatarInitials("Jane Doe")         → "JD"  (multi word → first+last initial)
 *   avatarColor("name")                → deterministic HSL color from djb2 hash
 *
 * These functions are imported by:
 *   - src/server/auth.ts               (computes User.initials server-side)
 *   - src/components/layout/TopBar.tsx (top-right avatar)
 *   - src/components/layout/PageInfoPanel.tsx (commit history avatars)
 *   - src/pages/DocPage.tsx            (presence viewer avatars)
 */

/** djb2-style hash of name → deterministic HSL background color. */
export function avatarColor(name: string): string {
	let hash = 0;
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
