import { WeatherSunnyRegular, WeatherMoonRegular, SearchRegular } from '@fluentui/react-icons';
import { useTheme } from '../../store/theme';
import { useUser } from '../../store/user';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

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
				className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs font-normal flex-1 max-w-64 justify-start"
				onClick={onSearchOpen}
			>
				<SearchRegular className="w-3.5 h-3.5 shrink-0" />
				<span>Search...</span>
				<kbd className="ml-auto text-xs bg-muted border border-border rounded px-1.5 py-0.5 font-mono leading-none">
					⌘K
				</kbd>
			</Button>

			<div className="ml-auto flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggle}>
							{theme === 'dark' ? (
								<WeatherSunnyRegular className="w-4 h-4" />
							) : (
								<WeatherMoonRegular className="w-4 h-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>Toggle theme</TooltipContent>
				</Tooltip>

				{user && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Avatar className="h-7 w-7 cursor-default">
								<AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
									{user.initials}
								</AvatarFallback>
							</Avatar>
						</TooltipTrigger>
						<TooltipContent>{user.displayName}</TooltipContent>
					</Tooltip>
				)}
			</div>
		</header>
	);
}
