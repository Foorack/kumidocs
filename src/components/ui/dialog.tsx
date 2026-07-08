import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import cn from "@/lib/utils";

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean;
}

interface DialogFooterProps extends ComponentProps<"div"> {
  showCloseButton?: boolean;
}

const Dialog = (allProps: ComponentProps<typeof DialogPrimitive.Root>): JSX.Element => (
  <DialogPrimitive.Root {...allProps} data-slot="dialog" />
);

const DialogTrigger = (allProps: ComponentProps<typeof DialogPrimitive.Trigger>): JSX.Element => (
  <DialogPrimitive.Trigger {...allProps} data-slot="dialog-trigger" />
);

const DialogPortal = (allProps: ComponentProps<typeof DialogPrimitive.Portal>): JSX.Element => (
  <DialogPrimitive.Portal {...allProps} data-slot="dialog-portal" />
);

const DialogClose = (allProps: ComponentProps<typeof DialogPrimitive.Close>): JSX.Element => (
  <DialogPrimitive.Close {...allProps} data-slot="dialog-close" />
);

const DialogOverlay = (allProps: ComponentProps<typeof DialogPrimitive.Overlay>): JSX.Element => {
  const { className } = allProps;
  return (
    <DialogPrimitive.Overlay
      {...allProps}
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
    />
  );
};

const DialogContent = (allProps: DialogContentProps): JSX.Element => {
  const { className, children, showCloseButton = true, ...rest } = allProps;
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        {...rest}
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className,
        )}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
};

const DialogHeader = (allProps: ComponentProps<"div">): JSX.Element => {
  const { className } = allProps;
  return (
    <div
      {...allProps}
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
    />
  );
};

const DialogFooter = (allProps: DialogFooterProps): JSX.Element => {
  const { className, showCloseButton = false, children, ...rest } = allProps;
  return (
    <div
      {...rest}
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
};

const DialogTitle = (allProps: ComponentProps<typeof DialogPrimitive.Title>): JSX.Element => {
  const { className } = allProps;
  return (
    <DialogPrimitive.Title
      {...allProps}
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-bold", className)}
    />
  );
};

const DialogDescription = (
  allProps: ComponentProps<typeof DialogPrimitive.Description>,
): JSX.Element => {
  const { className } = allProps;
  return (
    <DialogPrimitive.Description
      {...allProps}
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
    />
  );
};

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
