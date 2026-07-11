import { useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import Input from "./input";
import { ScrollArea } from "./scroll-area";
import { UserAvatar } from "./avatar";
import { emailToDisplayName } from "@/lib/avatar";

interface UserSearchDropdownProps {
  /** Sorted, deduplicated list of all known user emails. */
  users: string[];
  /** Map from email to display name for rendering. */
  displayNames: Map<string, string>;
  /** Currently selected/entered value. */
  value: string;
  /** Called when the user selects or types a value. */
  onChange: (value: string) => void;
  /** Placeholder text for the input field. */
  placeholder?: string;
  /** Optional CSS class for the wrapper. */
  className?: string;
}

function UserSearchDropdown({
  users,
  displayNames,
  value,
  onChange,
  placeholder = "",
  className = "",
}: UserSearchDropdownProps): JSX.Element {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (query === "") {
      return users;
    }
    const lower = query.toLowerCase();
    return users.filter((email) => {
      const display = displayNames.get(email) ?? email;
      return email.toLowerCase().includes(lower) || display.toLowerCase().includes(lower);
    });
  }, [users, displayNames, query]);

  const shown = query === "" ? users : filtered;
  const showDropdown = focused && shown.length > 0;

  function select(email: string): void {
    onChange(email);
    setQuery(email);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div className={`relative ${className}`}>
      <Input
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        onChange={(ev) => {
          setQuery(ev.target.value);
          onChange(ev.target.value);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          // Delay hiding so click on dropdown item registers first
          setTimeout(() => {
            setFocused(false);
          }, 150);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            setFocused(false);
            inputRef.current?.blur();
          }
          if (ev.key === "Enter" && shown.length > 0) {
            const first = shown[0];
            if (first !== undefined) {
              select(first);
            }
            ev.preventDefault();
          }
        }}
      />
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-md"
        >
          <ScrollArea className="max-h-48">
            <ul className="py-1">
              {shown.map((email) => {
                const display = displayNames.get(email) ?? emailToDisplayName(email);
                return (
                  <li
                    key={email}
                    role="option"
                    aria-selected={email === value}
                    tabIndex={-1}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent aria-selected:bg-accent"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      select(email);
                    }}
                  >
                    <UserAvatar name={display} email={email} size="xs" />
                    <span className="font-medium truncate">{display}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">{email}</span>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export default UserSearchDropdown;
