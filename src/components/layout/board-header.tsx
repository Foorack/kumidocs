import type { JSX, ReactNode } from "react";

interface BoardHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

function BoardHeader({ icon, title, subtitle, children }: BoardHeaderProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <span className="w-6 h-6 shrink-0 flex items-center justify-center">{icon}</span>
      <div className="flex flex-col min-w-0">
        <h1 className="font-bold text-base truncate">{title}</h1>
        <div className="flex items-center gap-1 -mt-1">
          <span className="text-xs tabular-nums">{subtitle}</span>
        </div>
      </div>
      {children !== undefined && (
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">{children}</div>
      )}
    </div>
  );
}

export default BoardHeader;
