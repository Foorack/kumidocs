import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './store/theme';
import { UserProvider } from './store/user';
import { AppShell } from './components/layout/AppShell';
import FilePage from './pages/FilePage';
import NotFound from './pages/NotFound';
import './index.css';
import WelcomePage from './pages/WelcomePage';
import ImageLibraryPage from './pages/ImageLibraryPage';

export function App() {
	return (
		<BrowserRouter>
			<ThemeProvider>
				<UserProvider>
					<TooltipProvider delayDuration={300}>
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
