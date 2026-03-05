import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ArrowLeftRegular } from '@fluentui/react-icons';

export default function NotFound() {
	const navigate = useNavigate();
	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
			<div className="text-5xl">🔍</div>
			<h1 className="text-xl font-semibold">Page not found</h1>
			<p className="text-muted-foreground text-sm max-w-xs">
				The path you navigated to doesn't match any known route.
			</p>
			<Button variant="outline" onClick={() => navigate('/p/README.md')}>
				<ArrowLeftRegular className="mr-2 w-4 h-4" />
				Go to home
			</Button>
		</div>
	);
}
