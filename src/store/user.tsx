import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../lib/types';

interface UserContextValue {
	user: User | null;
	loading: boolean;
	needsEmailSetup: boolean;
	setEmailAndRefetch: (email: string) => void;
}

const UserContext = createContext<UserContextValue>({
	user: null,
	loading: true,
	needsEmailSetup: false,
	setEmailAndRefetch: () => {
		window.location.reload();
	},
});

async function fetchMe(): Promise<{ user: User | null; needs401: boolean }> {
	try {
		const r = await fetch('/api/me');
		if (r.status === 401) return { user: null, needs401: true };
		if (!r.ok) return { user: null, needs401: false };
		return { user: (await r.json()) as User, needs401: false };
	} catch {
		return { user: null, needs401: false };
	}
}

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [needsEmailSetup, setNeedsEmailSetup] = useState(false);

	useEffect(() => {
		void fetchMe().then(({ user: u, needs401 }) => {
			setUser(u);
			setNeedsEmailSetup(needs401);
			setLoading(false);
		});
	}, []);

	const setEmailAndRefetch = useCallback((email: string) => {
		document.cookie = `kumidocs_email=${encodeURIComponent(email.trim().toLowerCase())}; path=/; SameSite=Lax`;
		window.location.reload();
	}, []);

	return (
		<UserContext.Provider value={{ user, loading, needsEmailSetup, setEmailAndRefetch }}>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	return useContext(UserContext);
}
