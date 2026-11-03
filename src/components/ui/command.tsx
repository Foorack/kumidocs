import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import type { ComponentProps } from "react";
import { SearchIcon } from "lucide-react";
import cn from "@/lib/utils";

interface CommandDialogProps extends ComponentProps<typeof Dialog> {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  shouldFilter?: boolean;
}

const Command = (allProps: ComponentProps<typeof CommandPrimitive>): JSX.Element => {
  const { className } = allProps;
  return (
    <CommandPrimitive
      {...allProps}
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className,
      )}
    />
  );
};

const CommandDialog = (allProps: CommandDialogProps): JSX.Element => {
  const {
    title = "Command Palette",
    description = "Search for a command to run...",
    children,
    className,
    showCloseButton = true,
    shouldFilter,
  } = allProps;
  return (
    <Dialog {...allProps}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command
          shouldFilter={shouldFilter}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = (allProps: ComponentProps<typeof CommandPrimitive.Input>): JSX.Element => {
  const { className } = allProps;
  return (
    <div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        {...allProps}
        data-slot="command-input"
        className={cn(
          "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
    </div>
  );
};

const CommandList = (allProps: ComponentProps<typeof CommandPrimitive.List>): JSX.Element => {
  const { className } = allProps;
  return (
    <CommandPrimitive.List
      {...allProps}
      data-slot="command-list"
      className={cn("max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto", className)}
    />
  );
};

const CommandEmpty = (allProps: ComponentProps<typeof CommandPrimitive.Empty>): JSX.Element => (
  <CommandPrimitive.Empty
    {...allProps}
    data-slot="command-empty"
    className="py-6 text-center text-sm"
  />
);

const CommandGroup = (allProps: ComponentProps<typeof CommandPrimitive.Group>): JSX.Element => {
  const { className } = allProps;
  return (
    <CommandPrimitive.Group
      {...allProps}
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-foreground",
        className,
      )}
    />
  );
};

const CommandSeparator = (
  allProps: ComponentProps<typeof CommandPrimitive.Separator>,
): JSX.Element => {
  const { className } = allProps;
  return (
    <CommandPrimitive.Separator
      {...allProps}
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
    />
  );
};

const CommandItem = (allProps: ComponentProps<typeof CommandPrimitive.Item>): JSX.Element => {
  const { className } = allProps;
  return (
    <CommandPrimitive.Item
      {...allProps}
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
    />
  );
};

const CommandShortcut = (allProps: ComponentProps<"span">): JSX.Element => {
  const { className } = allProps;
  return (
    <span
      {...allProps}
      data-slot="command-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
    />
  );
};

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
