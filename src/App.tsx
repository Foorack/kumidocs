import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './store/theme';
import { UserProvider, useUser } from './store/user';
import { AppShell } from './components/layout/AppShell';
import FilePage from './pages/FilePage';
import NotFound from './pages/NotFound';
import './index.css';
import WelcomePage from './pages/WelcomePage';
import ImageLibraryPage from './pages/ImageLibraryPage';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

function EmailSetupDialog() {
	const { needsEmailSetup, setEmailAndRefetch } = useUser();
	const [email, setEmail] = useState('');

	function handleSubmit(e: React.SubmitEvent) {
		e.preventDefault();
		if (!email.includes('@')) return;
		setEmailAndRefetch(email);
	}

	return (
		<Dialog open={needsEmailSetup}>
			<DialogContent className="sm:max-w-sm" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Enter your email</DialogTitle>
					<p className="text-sm text-muted-foreground">
						No identity provider was detected. Enter your email to continue — it will be
						stored as a local cookie.
					</p>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						handleSubmit(e);
					}}
				>
					<div className="grid gap-3 py-2">
						<Label htmlFor="email-input">Email</Label>
						<Input
							id="email-input"
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value);
							}}
							autoFocus
							required
						/>
					</div>
					<DialogFooter className="mt-2">
						<Button type="submit" disabled={!email.includes('@')}>
							Continue
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function App() {
	return (
		<BrowserRouter>
			<ThemeProvider>
				<UserProvider>
					<TooltipProvider delayDuration={300}>
						<EmailSetupDialog />
						<Routes>
							<Route path="/" element={<Navigate to="/p/README.md" replace />} />{' '}
							<Route element={<AppShell />}>
								<Route path="/p/*" element={<FilePage />} />
								<Route path="/i" element={<ImageLibraryPage />} />
								<Route path="/i/:filename" element={<ImageLibraryPage />} />
								<Route path="/welcome" element={<WelcomePage />} />
								<Route path="*" element={<NotFound />} />
							</Route>
						</Routes>
					</TooltipProvider>
				</UserProvider>
			</ThemeProvider>
		</BrowserRouter>
	);
}

export default App;
