import { SearchRegular } from '@fluentui/react-icons';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { EmojiIcon } from '../ui/EmojiIcon';
import { useTheme } from '../../store/theme';
import { useUser } from '../../store/user';
import { UserAvatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Kbd, KbdGroup } from '../ui/kbd';

interface TopBarProps {
	instanceName: string;
	onSearchOpen: () => void;
}

export function TopBar({ instanceName, onSearchOpen }: TopBarProps) {
	const { theme, toggle } = useTheme();
	const { user } = useUser();

	return (
		<header className="h-11 border-b border-border bg-background/95 backdrop-blur flex items-center px-3 gap-2 shrink-0 z-10">
			<span className="font-semibold text-sm text-foreground select-none mr-2">
				{instanceName}
			</span>

			<Button
				variant="ghost"
				size="sm"
				className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs font-normal flex-1 max-w-64 justify-start bg-muted hover:bg-muted/80 cursor-pointer"
				onClick={onSearchOpen}
			>
				<SearchRegular className="w-3.5 h-3.5 shrink-0" />
				<span>Search...</span>
				<KbdGroup className="ml-auto">
					<Kbd>⌘</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
			</Button>

			<div className="ml-auto flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggle}>
							{theme === 'dark' ? (
								<EmojiIcon emoji="🌙" size={16} />
							) : (
								<EmojiIcon emoji="☀️" size={16} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>Toggle theme</TooltipContent>
				</Tooltip>

				{user && (
					<div className="flex items-center gap-3">
						<span className="text-xs text-foreground select-none">
							{user.displayName}
						</span>
						<PopoverPrimitive.Root>
							<PopoverPrimitive.Trigger asChild>
								<button className="rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<UserAvatar
										name={user.displayName}
										email={user.email}
										size="md"
									/>
								</button>
							</PopoverPrimitive.Trigger>
							<PopoverPrimitive.Portal>
								<PopoverPrimitive.Content
									align="end"
									sideOffset={8}
									className="z-50 w-64 rounded-lg border border-border bg-popover p-4 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
								>
									<div className="flex flex-col items-center gap-3">
										<UserAvatar
											name={user.displayName}
											email={user.email}
											size="lg"
										/>
										<div className="text-center">
											<p className="text-sm font-semibold text-foreground">
												{user.displayName}
											</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												{user.email}
											</p>
										</div>
									</div>
								</PopoverPrimitive.Content>
							</PopoverPrimitive.Portal>
						</PopoverPrimitive.Root>
					</div>
				)}
			</div>
		</header>
	);
}
