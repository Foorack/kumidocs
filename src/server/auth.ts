import { createHash } from 'crypto';
import type { User } from '../lib/types';

export interface KumiDocsPermissions {
	instanceName?: string;
	editors?: string[];
}

let perms: KumiDocsPermissions = {};

export function setPermissions(p: KumiDocsPermissions): void {
	perms = p;
}

export function getPermissions(): KumiDocsPermissions {
	return perms;
}

/** Derive a display name from an email address.
 *  "max.faxalv@sony.com" → "Max Faxalv"
 *  "max@foorack.com"     → "Max"
 */
function emailToDisplayName(email: string): string {
	const local = email.split('@')[0] ?? email;
	return local
		.split('.')
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
		.join(' ')
		.trim();
}

export function parseUser(headers: Headers, authHeader: string): User | null {
	const value = headers.get(authHeader);
	if (!value) return null;

	let email = '';

	// Detect JWT (two dots = three Base64url segments)
	const parts = value.split('.');
	if (parts.length === 3) {
		try {
			const paddedPart = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
			interface JWTPayload {
				sub?: string;
				email?: string;
				name?: string;
				preferred_username?: string;
			}
			const payload = JSON.parse(atob(paddedPart)) as JWTPayload;
			email = (payload.email ?? payload.sub ?? value).trim().toLowerCase();
		} catch {
			// fall through to plain string handling
			email = value.trim().toLowerCase();
		}
	} else {
		email = value.trim().toLowerCase();
	}

	const id = email;
	const displayName = emailToDisplayName(email);
	const gravatarHash = createHash('md5').update(email).digest('hex');

	const editors = perms.editors ?? [];

	// If no editors configured at all, everyone can edit
	const canEdit = editors.length === 0 || editors.includes(email);

	return { id, email, name: displayName, displayName, gravatarHash, canEdit };
}
