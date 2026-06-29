import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Search } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { useTheme } from "@/store/theme";
import { useUser } from "@/store/user";

interface TopBarProps {
  instanceName: string;
  headSha: string;
  onSearchOpen: () => void;
}

const ThemeToggle = (): JSX.Element => {
  const { theme, toggle } = useTheme();
  let emoji = "☀️";
  if (theme === "dark") {
    emoji = "🌙";
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white hover:bg-neutral-800"
          onClick={toggle}
        >
          <EmojiIcon emoji={emoji} size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle theme</TooltipContent>
    </Tooltip>
  );
};

const UserProfile = (allProps: { headSha: string }): JSX.Element => {
  const { user } = useUser();
  const { headSha } = allProps;
  if (!user) {
    return <></>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white select-none">{user.displayName}</span>
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar name={user.displayName} email={user.email} size="md" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="end"
            sideOffset={8}
            className="z-50 w-64 rounded-lg border border-border bg-popover p-4 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <div className="flex flex-col items-center gap-3">
              <UserAvatar name={user.displayName} email={user.email} size="lg" />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{user.displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              </div>
              {headSha && (
                <div className="w-full border-t border-border pt-2 mt-1 text-center">
                  <p className="text-xs text-muted-foreground">HEAD</p>
                  <code className="text-xs font-mono text-foreground">{headSha}</code>
                </div>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
};

const TopBar = (allProps: TopBarProps): JSX.Element => {
  const { instanceName, headSha, onSearchOpen } = allProps;
  return (
    <header className="h-11 border-b border-neutral-800 bg-black grid grid-cols-3 items-center px-3 gap-2 shrink-0 z-10 shadow-sm">
      <div className="flex justify-start">
        <span className="font-mono font-bold text-2xl text-white select-none pt-[3px]">
          {instanceName}
        </span>
      </div>
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs font-normal w-full max-w-96 justify-start bg-white hover:bg-white/90"
          onClick={onSearchOpen}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span>Search...</span>
          <KbdGroup className="ml-auto">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </div>
      <div className="flex items-center gap-1 justify-end">
        <ThemeToggle />
        <UserProfile headSha={headSha} />
      </div>
    </header>
  );
};

export default TopBar;
