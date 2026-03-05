import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../lib/types';

interface UserContextValue {
	user: User | null;
	loading: boolean;
}

const UserContext = createContext<UserContextValue>({ user: null, loading: true });

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/api/me')
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				setUser(data as User | null);
				setLoading(false);
			})
			.catch(() => {
				setLoading(false);
			});
	}, []);

	return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
}

export function useUser() {
	return useContext(UserContext);
}
