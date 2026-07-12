import { useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";

interface BoardFilterBarProps {
  sortBy: "created" | "updated";
  onSortByChange: (val: "created" | "updated") => void;
  sortOrder: "newest" | "oldest";
  onSortOrderChange: (val: "newest" | "oldest") => void;
  filterReporter: string;
  onFilterReporterChange: (val: string) => void;
  filterAssignee: string;
  onFilterAssigneeChange: (val: string) => void;
  users: string[];
  displayNames: Map<string, string>;
}

function BoardFilterBar({
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  filterReporter,
  onFilterReporterChange,
  filterAssignee,
  onFilterAssigneeChange,
  users,
  displayNames,
}: BoardFilterBarProps): JSX.Element {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const hasFilter = filterReporter !== "" || filterAssignee !== "";

  // Label for the filter button
  let filterLabel = "Filter";
  if (hasFilter) {
    const parts: string[] = [];
    if (filterReporter !== "") {
      parts.push(`Created: ${displayNames.get(filterReporter) ?? filterReporter}`);
    }
    if (filterAssignee !== "") {
      parts.push(`Assigned: ${displayNames.get(filterAssignee) ?? filterAssignee}`);
    }
    filterLabel = parts.join(", ");
  }

  // Label for the sort button
  const sortLabel =
    sortBy === "updated"
      ? `Updated, ${sortOrder === "newest" ? "newest" : "oldest"}`
      : `Created, ${sortOrder === "newest" ? "newest" : "oldest"}`;

  const sortOptions = [
    { label: "Updated, newest first", sortBy: "updated" as const, sortOrder: "newest" as const },
    { label: "Updated, oldest first", sortBy: "updated" as const, sortOrder: "oldest" as const },
    { label: "Created, newest first", sortBy: "created" as const, sortOrder: "newest" as const },
    { label: "Created, oldest first", sortBy: "created" as const, sortOrder: "oldest" as const },
  ];

  // Filter user list by search query
  const filteredUsers = useMemo(() => {
    if (filterSearch === "") {
      return users;
    }
    const lower = filterSearch.toLowerCase();
    return users.filter((email) => {
      const display = displayNames.get(email) ?? email;
      return email.toLowerCase().includes(lower) || display.toLowerCase().includes(lower);
    });
  }, [users, displayNames, filterSearch]);

  function applyReporter(email: string): void {
    onFilterReporterChange(email);
    setFilterOpen(false);
    setFilterSearch("");
  }

  function applyAssignee(email: string): void {
    onFilterAssigneeChange(email);
    setFilterOpen(false);
    setFilterSearch("");
  }

  function clearFilters(): void {
    onFilterReporterChange("");
    onFilterAssigneeChange("");
    setFilterOpen(false);
    setFilterSearch("");
  }

  return (
    <div className="flex gap-1 px-2 pb-2 border-b border-border">
      {/* Filter dropdown */}
      <DropdownMenu
        open={filterOpen}
        onOpenChange={(open) => {
          setFilterOpen(open);
          if (!open) {
            setFilterSearch("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={hasFilter ? "secondary" : "outline"}
            size="sm"
            className={`flex-1 truncate ${hasFilter ? "font-bold" : ""}`}
          >
            {filterLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-h-80">
          <div className="px-2 py-1.5">
            <input
              ref={searchRef}
              value={filterSearch}
              onChange={(ev) => {
                setFilterSearch(ev.target.value);
              }}
              placeholder="Search users..."
              className="w-full h-7 rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground outline-none focus:border-ring"
              autoFocus
            />
          </div>

          {filterSearch === "" && (
            <div className="px-2 pb-1 text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Created by
            </div>
          )}
          {filteredUsers.slice(0, 30).map((email) => {
            const display = displayNames.get(email) ?? emailToDisplayName(email);
            const selected = email === filterReporter;
            return (
              <DropdownMenuItem
                key={`reporter-${email}`}
                onSelect={() => {
                  applyReporter(email);
                }}
                className={selected ? "bg-accent" : ""}
              >
                <UserAvatar name={display} email={email} size="xxs" />
                <span className="truncate flex-1">{email}</span>
                {selected && <span className="text-xs text-primary">Created</span>}
              </DropdownMenuItem>
            );
          })}

          {filterSearch === "" && filteredUsers.length > 0 && <DropdownMenuSeparator />}

          {filterSearch === "" && (
            <div className="px-2 pb-1 pt-1 text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Assigned to
            </div>
          )}
          {filteredUsers.slice(0, 30).map((email) => {
            const display = displayNames.get(email) ?? emailToDisplayName(email);
            const selected = email === filterAssignee;
            return (
              <DropdownMenuItem
                key={`assignee-${email}`}
                onSelect={() => {
                  applyAssignee(email);
                }}
                className={selected ? "bg-accent" : ""}
              >
                <UserAvatar name={display} email={email} size="xxs" />
                <span className="truncate flex-1">{email}</span>
                {selected && <span className="text-xs text-primary">Assigned</span>}
              </DropdownMenuItem>
            );
          })}

          {hasFilter && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={clearFilters}
                className="text-destructive justify-center text-xs"
              >
                Clear filter
              </DropdownMenuItem>
            </>
          )}

          {filteredUsers.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No users found
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort dropdown */}
      <DropdownMenu open={sortOpen} onOpenChange={setSortOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 truncate"
          >
            {sortLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {sortOptions.map((option) => {
            const active = sortBy === option.sortBy && sortOrder === option.sortOrder;
            return (
              <DropdownMenuItem
                key={option.label}
                onSelect={() => {
                  onSortByChange(option.sortBy);
                  onSortOrderChange(option.sortOrder);
                  setSortOpen(false);
                }}
                className={active ? "bg-accent font-bold" : ""}
              >
                <span className="flex-1">{option.label}</span>
                {active && <span className="text-xs text-primary">&#10003;</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default BoardFilterBar;
