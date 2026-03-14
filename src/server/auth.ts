import type { User } from '../lib/types';
import type { SlideThemeMap } from '../lib/slide';
import { emailToDisplayName } from '../lib/avatar';

export interface KumiDocsPermissions {
	instanceName?: string;
	editors?: string[];
	slideThemes?: SlideThemeMap;
}

let perms: KumiDocsPermissions = {};

export function setPermissions(p: KumiDocsPermissions): void {
	perms = p;
}

export function getPermissions(): KumiDocsPermissions {
	return perms;
}

/** Parse the `kumidocs_email` cookie value from a Cookie header string. */
function cookieEmail(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(';')) {
		const [k, ...v] = part.trim().split('=');
		if (k?.trim() === 'kumidocs_email') {
			const raw = decodeURIComponent(v.join('=').trim());
			return raw || null;
		}
	}
	return null;
}

export function parseUser(headers: Headers, authHeader: string): User | null {
	const value = headers.get(authHeader) ?? cookieEmail(headers.get('cookie'));
	if (!value) return null;

	let email: string;

	// Detect JWT (two dots = three Base64url segments)
	const parts = value.split('.');
	if (parts.length === 3) {
		try {
			const paddedPart = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
			interface JWTPayload {
				email?: string;
				preferred_username?: string;
			}
			const payload = JSON.parse(atob(paddedPart)) as JWTPayload;
			const raw = payload.email ?? payload.preferred_username;
			if (!raw) return null; // JWT present but no usable email claim
			email = raw.trim().toLowerCase();
		} catch {
			// fall through to plain string handling
			email = value.trim().toLowerCase();
		}
	} else {
		email = value.trim().toLowerCase();
	}

	const displayName = emailToDisplayName(email);
	const editors = perms.editors ?? [];

	// If no editors configured at all, everyone can edit
	const canEdit = editors.length === 0 || editors.includes(email);

	return { id: email, email, name: displayName, displayName, canEdit };
}
