import { EmojiIcon } from '@/components/ui/EmojiIcon';

export default function WelcomePage() {
	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
			<div className="text-5xl">
				<EmojiIcon emoji="🎆" size="1em" />
			</div>
			<h1 className="text-xl font-semibold">Welcome to KumiDocs</h1>
			<p className="text-muted-foreground text-sm max-w-xs">
				Select a markdown file from the sidebar to get started, or create a new one!
			</p>
		</div>
	);
}
