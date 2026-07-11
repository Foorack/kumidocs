import type { JSX } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from "lucide-react";
import UserSearchDropdown from "@/components/ui/user-search-dropdown";

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
  return (
    <div className="space-y-2 px-2 pb-2 border-b border-border">
      {/* Sort row */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            onSortByChange(sortBy === "updated" ? "created" : "updated");
          }}
          className="flex-1 h-7 rounded text-xs bg-accent/50 hover:bg-accent transition-colors px-2"
        >
          {sortBy === "updated" ? "Updated" : "Created"}
        </button>
        <button
          type="button"
          onClick={() => {
            onSortOrderChange(sortOrder === "newest" ? "oldest" : "newest");
          }}
          className="h-7 w-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
          title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
        >
          {sortOrder === "newest" ? (
            <ArrowDownWideNarrow className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpWideNarrow className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Reporter filter */}
      <UserSearchDropdown
        users={users}
        displayNames={displayNames}
        value={filterReporter}
        onChange={onFilterReporterChange}
        placeholder="Created by..."
        className="w-full"
      />

      {/* Assignee filter */}
      <UserSearchDropdown
        users={users}
        displayNames={displayNames}
        value={filterAssignee}
        onChange={onFilterAssigneeChange}
        placeholder="Assigned to..."
        className="w-full"
      />
    </div>
  );
}

export default BoardFilterBar;
