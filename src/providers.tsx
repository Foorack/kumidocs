import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserProvider, useUser } from "@/store/user";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/store/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";

const TOOLTIP_DELAY = 300;

const EmailSetupDialog = (): JSX.Element => {
  const { needsEmailSetup, setEmailAndRefetch } = useUser();
  const [email, setEmail] = useState("");
  return (
    <Dialog open={needsEmailSetup}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Enter your email</DialogTitle>
          <p className="text-foreground">
            No identity provider was detected. Enter your email to continue; it will be stored as a
            local cookie.
          </p>
        </DialogHeader>
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            setEmailAndRefetch(email);
          }}
        >
          <div className="grid gap-3 py-2">
            <Label htmlFor="email-input">Email</Label>
            <Input
              id="email-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event): void => {
                setEmail(event.target.value);
              }}
              autoFocus
              required
            />
          </div>
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={!email.includes("@")}>
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface ProvidersProps {
  children: ReactNode;
}

const Providers = (allProps: ProvidersProps): JSX.Element => {
  const { children } = allProps;

  return (
    <ThemeProvider>
      <UserProvider>
        <TooltipProvider delayDuration={TOOLTIP_DELAY}>
          <EmailSetupDialog />
          {children}
        </TooltipProvider>
      </UserProvider>
    </ThemeProvider>
  );
};

export default Providers;
