import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  /** Optional label describing this boundary's region (e.g. "page", "sidebar"). */
  label?: string;
}

interface State {
  error: Error | undefined;
}

/**
 * Generic React error boundary.
 *
 * Catches render-time errors in its subtree and shows a fallback UI
 * instead of letting the whole app white-screen.  A "Try again" button
 * resets the error state and re-renders the children.
 */
class ErrorBoundary extends Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = { error: undefined };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.label;
    const tag = label !== undefined && label !== "" ? ` (${label})` : "";
    console.error(`[ErrorBoundary${tag}]`, error, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: undefined });
  };

  public override render(): ReactNode {
    if (this.state.error) {
      const label = this.props.label ?? "";
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-background text-foreground p-8">
          <div className="text-destructive text-4xl">!</div>
          <p className="text-lg font-bold">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {label ? `The ${label} encountered an error.` : "A render error occurred."}
          </p>
          <pre className="text-xs text-muted-foreground max-w-lg overflow-auto max-h-24 border rounded p-2">
            {this.state.error.message}
          </pre>
          <Button onClick={this.handleRetry} variant="outline">
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
