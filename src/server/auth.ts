import type { User } from '../lib/types';
import { avatarInitials } from '../lib/avatar';

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

export function parseUser(headers: Headers, authHeader: string): User | null {
	const value = headers.get(authHeader);
	if (!value) return null;

	let id = value;
	let email = '';
	let name = '';

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
			id = payload.sub ?? value;
			email = payload.email ?? '';
			name = payload.name ?? payload.preferred_username ?? payload.sub ?? value;
		} catch {
			// fall through to plain string handling
		}
	} else {
		email = value.includes('@') ? value : '';
		name = (value.split('@')[0] ?? value).replace(/[._-]/g, ' ');
		id = value;
	}

	const displayName = (name.trim() || email.split('@')[0]) ?? id;

	const initials = avatarInitials(displayName) || '?';

	const editors = perms.editors ?? [];

	// If no editors configured at all, everyone can edit
	const canEdit = editors.length === 0 || editors.includes(email) || editors.includes(id);

	return { id, email, name: displayName, displayName, initials, canEdit };
}
