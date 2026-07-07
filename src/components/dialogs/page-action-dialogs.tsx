import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import type { RefObject } from "react";

const ROOT = "__root__";

interface PageOption {
  path: string;
  dir: string;
  title: string;
}

interface PageActionDialogsProps {
  moveOpen: boolean;
  setMoveOpen: (open: boolean) => void;
  movePages: PageOption[];
  moveParent: string;
  setMoveParent: (parent: string) => void;
  moveSlug: string;
  setMoveSlug: (slug: string) => void;
  parentOpen: boolean;
  parentSearch: string;
  setParentSearch: (search: string) => void;
  comboboxRef: RefObject<HTMLDivElement | null>;
  closeParentDropdown: () => void;
  openParentDropdown: () => void;
  confirmMove: () => Promise<void>;
  moveError?: string;
  previewPath: string;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  deleteTitle: string;
  deleteTarget: string;
  confirmDelete: () => Promise<void>;
  deleteError?: string;
}

function PageActionDialogs({
  moveOpen,
  setMoveOpen,
  movePages,
  moveParent,
  setMoveParent,
  moveSlug,
  setMoveSlug,
  parentOpen,
  parentSearch,
  setParentSearch,
  comboboxRef,
  closeParentDropdown,
  openParentDropdown,
  confirmMove,
  moveError,
  previewPath,
  deleteOpen,
  setDeleteOpen,
  deleteTitle,
  deleteTarget,
  confirmDelete,
  deleteError,
}: PageActionDialogsProps): JSX.Element {
  return (
    <>
      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Parent</Label>
              {/* Searchable combobox */}
              <div ref={comboboxRef} className="relative">
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => {
                    if (parentOpen) {
                      closeParentDropdown();
                    } else {
                      openParentDropdown();
                    }
                  }}
                >
                  <span className="truncate text-left">
                    {moveParent === ROOT
                      ? "(root)"
                      : (movePages.find((pg) => pg.dir === moveParent)?.title ?? moveParent)}
                  </span>
                  <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
                {parentOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                    <Command shouldFilter={false}>
                      <CommandInput
                        autoFocus
                        placeholder="Search pages…"
                        value={parentSearch}
                        onValueChange={setParentSearch}
                      />
                      <CommandList className="max-h-48">
                        <CommandEmpty>No pages found.</CommandEmpty>
                        <CommandGroup>
                          {/* Root option */}
                          {"(root)".includes(parentSearch.toLowerCase()) && (
                            <CommandItem
                              value={ROOT}
                              onSelect={() => {
                                setMoveParent(ROOT);
                                closeParentDropdown();
                                setParentSearch("");
                              }}
                            >
                              <CheckIcon
                                className={`mr-2 h-4 w-4 ${moveParent === ROOT ? "opacity-100" : "opacity-0"}`}
                              />
                              (root)
                            </CommandItem>
                          )}
                          {movePages
                            .filter((pg) =>
                              pg.title.toLowerCase().includes(parentSearch.toLowerCase()),
                            )
                            .map((pg) => (
                              <CommandItem
                                key={pg.path}
                                value={pg.dir}
                                onSelect={() => {
                                  setMoveParent(pg.dir);
                                  closeParentDropdown();
                                  setParentSearch("");
                                }}
                              >
                                <CheckIcon
                                  className={`mr-2 h-4 w-4 ${moveParent === pg.dir ? "opacity-100" : "opacity-0"}`}
                                />
                                <span className="truncate">{pg.title}</span>
                                <span className="ml-auto truncate text-xs text-muted-foreground">
                                  {pg.dir}
                                </span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Filename</Label>
              <Input
                value={moveSlug}
                onChange={(ev) => {
                  setMoveSlug(ev.target.value);
                }}
                placeholder="page-name"
                onKeyDown={async (ev) => {
                  if (ev.key === "Enter") {
                    try {
                      await confirmMove();
                    } catch (error: unknown) {
                      console.error("Move failed:", error);
                    }
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">→ {previewPath}</p>
            </div>
          </div>
          {moveError !== undefined && moveError !== "" && (
            <p className="text-red text-center">{moveError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMoveOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await confirmMove();
                } catch (error: unknown) {
                  console.error("Move failed:", error);
                }
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTitle}"?</DialogTitle>
            <DialogDescription>
              This will permanently delete <code className="font-mono">{deleteTarget}</code> and
              commit the change to git. This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          {deleteError !== undefined && deleteError !== "" && (
            <p className="text-red text-center">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await confirmDelete();
                } catch (error: unknown) {
                  console.error("Delete failed:", error);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { PageOption };
export { ROOT, PageActionDialogs };
