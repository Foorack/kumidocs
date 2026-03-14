import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../lib/types';
import type { SlideThemeMap } from '../lib/slide';

interface UserContextValue {
	user: User | null;
	loading: boolean;
	needsEmailSetup: boolean;
	slideThemes: SlideThemeMap;
	setEmailAndRefetch: (email: string) => void;
}

const UserContext = createContext<UserContextValue>({
	user: null,
	loading: true,
	needsEmailSetup: false,
	slideThemes: {},
	setEmailAndRefetch: () => {
		window.location.reload();
	},
});

interface MeResponse extends User {
	instanceName?: string;
	autoSaveDelay?: number;
	slideThemes?: SlideThemeMap;
}

async function fetchMe(): Promise<{
	user: User | null;
	slideThemes: SlideThemeMap;
	needs401: boolean;
}> {
	try {
		const r = await fetch('/api/me');
		if (r.status === 401) return { user: null, slideThemes: {}, needs401: true };
		if (!r.ok) return { user: null, slideThemes: {}, needs401: false };
		const data = (await r.json()) as MeResponse;
		const { slideThemes, ...userFields } = data;
		return { user: userFields as User, slideThemes: slideThemes ?? {}, needs401: false };
	} catch {
		return { user: null, slideThemes: {}, needs401: false };
	}
}

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [needsEmailSetup, setNeedsEmailSetup] = useState(false);
	const [slideThemes, setSlideThemes] = useState<SlideThemeMap>({});

	useEffect(() => {
		void fetchMe().then(({ user: u, slideThemes: st, needs401 }) => {
			setUser(u);
			setSlideThemes(st);
			setNeedsEmailSetup(needs401);
			setLoading(false);
		});
	}, []);

	const setEmailAndRefetch = useCallback((email: string) => {
		document.cookie = `kumidocs_email=${encodeURIComponent(email.trim().toLowerCase())}; path=/; SameSite=Lax`;
		window.location.reload();
	}, []);

	return (
		<UserContext.Provider
			value={{ user, loading, needsEmailSetup, slideThemes, setEmailAndRefetch }}
		>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	return useContext(UserContext);
}
