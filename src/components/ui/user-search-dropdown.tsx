import { useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import Input from "./input";
import { ScrollArea } from "./scroll-area";

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
      return [];
    }
    const lower = query.toLowerCase();
    return users.filter((email) => {
      const display = displayNames.get(email) ?? email;
      return email.toLowerCase().includes(lower) || display.toLowerCase().includes(lower);
    });
  }, [users, displayNames, query]);

  const showDropdown = focused && query !== "" && filtered.length > 0;

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
          if (ev.key === "Enter" && filtered.length > 0) {
            const first = filtered[0];
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
              {filtered.map((email) => (
                <li
                  key={email}
                  role="option"
                  aria-selected={email === value}
                  tabIndex={-1}
                  className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent aria-selected:bg-accent truncate"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    select(email);
                  }}
                >
                  <span className="font-medium">{displayNames.get(email) ?? email}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{email}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export default UserSearchDropdown;
