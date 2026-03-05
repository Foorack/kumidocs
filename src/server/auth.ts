import type { User } from '../lib/types';

export interface KumiDocsPermissions {
	instanceName?: string;
	editors?: string[];
	admins?: string[];
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
			const payload = JSON.parse(atob(paddedPart));
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

	const displayName = name.trim() || email.split('@')[0] || id;

	const initials =
		displayName
			.split(/[\s._-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => (p[0] ?? '').toUpperCase())
			.join('') || '?';

	const editors = perms.editors ?? [];
	const admins = perms.admins ?? [];
	const allEditors = [...editors, ...admins];

	// If no editors configured at all, everyone can edit
	const canEdit =
		allEditors.length === 0 || allEditors.includes(email) || allEditors.includes(id);

	return { id, email, name: displayName, displayName, initials, canEdit };
}
