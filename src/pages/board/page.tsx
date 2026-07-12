import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getAllTickets, getFile, getTree, putFile } from "@/lib/api";
import type { BoardConfig, TicketData } from "@/lib/board";
import { scrapeUsers } from "@/lib/user-list";
import {
  displayColumnId,
  isArchived,
  parseTicketYaml,
  patchTicketYaml,
  yamlToBoard,
} from "@/lib/board";
import { load as parseYaml } from "js-yaml";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import PageHeaderButton from "@/components/layout/page-header-button";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import ICONS from "@/components/ui/icon/fluent";
import type { PresenceUser } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/avatar";
import PageInfoPanel from "@/components/layout/page-info-panel";
import TicketDialog from "@/pages/ticket/ticket-dialog";
import usePagePresence from "@/hooks/use-page-presence";
import useInfoPanel from "@/hooks/use-info-panel";
import { useUser } from "@/store/user";
import { useWsListener } from "@/store/ws";
import type { JSX } from "react";
import BoardColumnView from "./column";
import BoardOverlay from "./board-overlay";

// oxlint-disable-next-line complexity
function BoardPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { name, "*": star } = useParams<{ name: string; "*": string }>();
  const boardSlug = name ?? "";
  const ticketIdFromUrl = star ?? "";
  const { instanceName, user } = useUser();

  const [config, setConfig] = useState<BoardConfig | undefined>(undefined);
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<
    | {
        assignee?: string;
        boardSlug: string;
        body: string;
        bookmarks?: string[];
        column: string;
        golden?: boolean;
        reporter?: string;
        ticketId: string;
        title: string;
      }
    | undefined
  >(undefined);

  // Board name map for the dialog
  const boardNameMap = useMemo<Map<string, string>>(
    () =>
      config ? new Map<string, string>([[boardSlug, config.name]]) : new Map<string, string>(),
    [config, boardSlug],
  );

  // Presence
  const boardFilePath = `${boardSlug}.yaml`;
  const [infoOpen, setInfoOpen] = useInfoPanel(boardFilePath);
  // We use the page presence hook with the board config file path for WS rooms.
  // No edit mode / dirty tracking needed for board views.
  const editModeRef = useRef(false);
  const isDirtyRef = useRef(false);
  const loadDocNoop = useCallback(async (): Promise<void> => {
    /* noop */
  }, []);
  const { viewers } = usePagePresence(
    boardFilePath,
    user?.id,
    editModeRef,
    isDirtyRef,
    loadDocNoop,
  );

  // Load board config and tickets
  useEffect(() => {
    if (!boardSlug) {
      return;
    }
    const loadBoardData = async (): Promise<void> => {
      setLoading(true);
      try {
        const resp = await getFile(`${boardSlug}.yaml`);
        const boardConfig = await yamlToBoard(resp.content);
        if (!boardConfig) {
          setLoading(false);
          return;
        }
        setConfig(boardConfig);
        document.title = `${boardConfig.name} | ${instanceName}`;

        const boardData = await getAllTickets(boardSlug);
        const board = boardData[0];
        // oxlint-disable-next-line no-negated-condition
        if (board !== undefined) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          setTickets(board.tickets as unknown as TicketData[]);
        } else {
          // Fallback: load tickets manually
          const tree = await getTree();
          const boardDir = tree.find((node) => node.type === "dir" && node.name === boardSlug);
          const ticketNodes =
            boardDir?.children?.filter(
              (child) => child.type === "file" && child.path.endsWith(".yaml"),
            ) ?? [];

          const boardDefaultColId =
            boardConfig.columns.find((col) => col.default === true)?.id ?? "";
          const loaded = await Promise.all(
            ticketNodes.map(async (node) => {
              const ticketId = node.name.replace(/\.yaml$/u, "");
              try {
                const fileResp = await getFile(node.path);
                return await parseTicketYaml(
                  fileResp.content,
                  boardSlug,
                  ticketId,
                  boardDefaultColId,
                );
              } catch {
                return { boardSlug, column: boardDefaultColId, id: ticketId, title: ticketId };
              }
            }),
          );
          setTickets(loaded);
        }
      } catch {
        setConfig(undefined);
      } finally {
        setLoading(false);
      }
    };
    void loadBoardData();
  }, [boardSlug]);

  // Columns from config
  const columns = config?.columns ?? [];
  const defaultColumnId = columns.find((col) => col.default === true)?.id ?? "";

  // Group tickets by column
  const ticketsByColumn = useMemo<Map<string, TicketData[]>>(() => {
    const map = new Map<string, TicketData[]>();
    for (const col of columns) {
      map.set(col.id, []);
    }
    const uncategorized: TicketData[] = [];
    for (const ticket of tickets) {
      if (!showArchived && isArchived(ticket.column, ticket.updatedAt, columns)) {
        continue;
      }
      const targetCol = columns.find(
        (col) =>
          col.id === ticket.column || displayColumnId(col.id) === displayColumnId(ticket.column),
      )?.id;
      if (targetCol !== undefined && targetCol !== "" && map.has(targetCol)) {
        const bucket = map.get(targetCol);
        if (bucket !== undefined) {
          bucket.push(ticket);
        }
      } else {
        uncategorized.push(ticket);
      }
    }
    const fallbackCol = defaultColumnId || (columns[0]?.id ?? "");
    if (uncategorized.length > 0 && fallbackCol !== "" && map.has(fallbackCol)) {
      const target = map.get(fallbackCol);
      if (target !== undefined) {
        target.push(...uncategorized);
      }
    }
    for (const [, colTicketList] of map) {
      colTicketList.sort((left, right) => {
        // Golden tickets always at the top
        if (left.golden === true && right.golden !== true) {
          return -1;
        }
        if (left.golden !== true && right.golden === true) {
          return 1;
        }
        // Within same golden group, sort by latest activity (updatedAt), newest first
        const la = left.updatedAt ?? left.createdAt ?? "";
        const ra = right.updatedAt ?? right.createdAt ?? "";
        return ra.localeCompare(la);
      });
    }
    return map;
  }, [tickets, columns, defaultColumnId, showArchived]);

  const dialogUsers = useMemo(() => scrapeUsers(tickets), [tickets]);

  // Dialog handlers
  const handleDialogClose = useCallback((): void => {
    setDialogOpen(false);
    setEditTicket(undefined);
    document.title = config ? `${config.name} | ${instanceName}` : `Board | ${instanceName}`;
    // Navigate back to the board root if on a ticket URL
    if (ticketIdFromUrl) {
      void navigate(`/b/${boardSlug}`, { replace: true });
    }
  }, [config, instanceName, ticketIdFromUrl, boardSlug, navigate]);

  const reloadTickets = useCallback(async (): Promise<void> => {
    if (!boardSlug) {
      return;
    }
    try {
      const tree = await getTree();
      const boardDir = tree.find((node) => node.type === "dir" && node.name === boardSlug);
      const ticketNodes =
        boardDir?.children?.filter(
          (child) => child.type === "file" && child.path.endsWith(".yaml"),
        ) ?? [];
      const boardDefaultColId = columns.find((col) => col.default === true)?.id ?? "";
      const loaded = await Promise.all(
        ticketNodes.map(async (node) => {
          const ticketId = node.name.replace(/\.yaml$/u, "");
          try {
            const fileResp = await getFile(node.path);
            return await parseTicketYaml(fileResp.content, boardSlug, ticketId, boardDefaultColId);
          } catch {
            return { boardSlug, column: boardDefaultColId, id: ticketId, title: ticketId };
          }
        }),
      );
      setTickets(loaded);
    } catch {
      // ignore
    }
  }, [boardSlug, columns]);

  // Reload tickets when another user saves a ticket file in this board
  useWsListener(
    useCallback(
      (msg) => {
        if (
          msg.type === "page_changed" &&
          msg.changedBy !== user?.id &&
          msg.pageId.startsWith(`${boardSlug}/`) &&
          msg.pageId.endsWith(".yaml")
        ) {
          void reloadTickets();
        }
      },
      [boardSlug, user?.id, reloadTickets],
    ),
  );

  const boardDefaultColId = columns.find((col) => col.default === true)?.id ?? "";

  // Open edit dialog for a ticket
  const openEditDialog = useCallback(
    async (ticket: TicketData): Promise<void> => {
      try {
        const resp = await getFile(`${ticket.boardSlug}/${ticket.id}.yaml`);
        const data = await parseTicketYaml(
          resp.content,
          ticket.boardSlug,
          ticket.id,
          boardDefaultColId,
        );
        // Parse body from raw YAML
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const parsed = parseYaml(resp.content) as Record<string, unknown>;
        setEditTicket({
          assignee: data.assignee,
          boardSlug: data.boardSlug,
          body: typeof parsed.body === "string" ? parsed.body : "",
          bookmarks: data.bookmarks,
          column: data.column,
          golden: data.golden,
          reporter: data.reporter,
          ticketId: data.id,
          title: data.title,
        });
        document.title = `[${config?.prefix ?? "?"}-${data.id}] ${data.title}`;
      } catch {
        setEditTicket({
          assignee: ticket.assignee,
          boardSlug: ticket.boardSlug,
          body: "",
          bookmarks: ticket.bookmarks,
          column: ticket.column,
          golden: ticket.golden,
          reporter: ticket.reporter,
          ticketId: ticket.id,
          title: ticket.title,
        });
        document.title = `[${config?.prefix ?? "?"}-${ticket.id}] ${ticket.title}`;
      }
      setDialogOpen(true);
      // Update URL to the ticket without full navigation
      void navigate(`/b/${ticket.boardSlug}/${ticket.id}`, { replace: true });
    },
    [boardDefaultColId, config?.prefix, navigate],
  );

  // Auto-open dialog when navigating directly to a ticket URL
  useEffect(() => {
    if (!ticketIdFromUrl || loading || tickets.length === 0) {
      return;
    }
    const ticket = tickets.find((tic) => tic.id === ticketIdFromUrl);
    if (ticket) {
      void openEditDialog(ticket);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketIdFromUrl, loading, tickets, location.pathname]);

  // Drag overlay state
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback((): void => {
    setActiveId(undefined);
  }, []);

  // Sensors with activation distance so clicks pass through
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Handle drag end (move ticket between columns)
  const handleDragEnd = useCallback(
    async (event: DragEndEvent): Promise<void> => {
      setActiveId(undefined);
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const dragActiveId = String(active.id);
      const overId = String(over.id);
      const dragActiveTicket = tickets.find((tic) => `${tic.boardSlug}/${tic.id}` === dragActiveId);
      if (!dragActiveTicket) {
        return;
      }

      // Target is a droppable column: "boardSlug/columnId"
      const targetColId = overId.replace(`${boardSlug}/`, "");

      if (!targetColId || targetColId === dragActiveTicket.column) {
        return;
      }

      try {
        const now = new Date().toISOString();
        const userEmail = user?.email ?? user?.name ?? "unknown";
        const path = `${dragActiveTicket.boardSlug}/${dragActiveTicket.id}.yaml`;
        const fileResp = await getFile(path);
        const dragDefaultColId = columns.find((col) => col.default === true)?.id ?? "";
        const yaml = await patchTicketYaml(
          fileResp.content,
          dragActiveTicket.boardSlug,
          dragActiveTicket.id,
          {
            column: targetColId,
            timeline: [
              ...(dragActiveTicket.timeline ?? []),
              {
                from: dragActiveTicket.column,
                timestamp: now,
                to: targetColId,
                type: "status" as const,
                user: userEmail,
              },
            ],
          },
          dragDefaultColId,
        );
        await putFile(path, yaml);
        setTickets((prev) =>
          prev.map((tic) =>
            `${tic.boardSlug}/${tic.id}` === dragActiveId ? { ...tic, column: targetColId } : tic,
          ),
        );
      } catch {
        // will revert on next reload
      }
    },
    [tickets, boardSlug, columns],
  );

  if (loading) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

  if (!config) {
    return <div className="flex-1 flex items-center justify-center">Board not found</div>;
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Board header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="w-6 h-6 shrink-0 flex items-center justify-center">
          {config.icon !== undefined && config.icon !== "" ? (
            <EmojiIcon emoji={config.icon} size={24} />
          ) : (
            <span dangerouslySetInnerHTML={{ __html: ICONS.Board24Color ?? "" }} />
          )}
        </span>
        <div className="flex flex-col min-w-0">
          <h1 className="font-bold text-base truncate">{config.name}</h1>
          <div className="flex items-center gap-1 -mt-1">
            <span className="text-xs tabular-nums">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </span>
          </div>
        </div>

        {/* Right: viewers + info */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div className="flex -space-x-1 me-3">
            {[...new Map(viewers.map((viewer) => [viewer.id, viewer])).values()]
              .slice(0, 5)
              .map((viewer: PresenceUser) => (
                <Tooltip key={viewer.id}>
                  <TooltipTrigger asChild>
                    <UserAvatar
                      name={viewer.name}
                      email={viewer.email}
                      size="sm"
                      className="border border-background ring-1 ring-border"
                    />
                  </TooltipTrigger>
                  <TooltipContent>{viewer.name}</TooltipContent>
                </Tooltip>
              ))}
          </div>

          <PageHeaderButton
            fileType="archive"
            label="Archived"
            active={showArchived}
            grayscaleWhenInactive
            onClick={() => {
              setShowArchived((prev) => !prev);
            }}
          />

          <PageHeaderButton
            fileType="pageinfo"
            label="Info"
            active={infoOpen}
            grayscaleWhenInactive
            onClick={() => {
              setInfoOpen(!infoOpen);
            }}
          />
        </div>
      </div>

      {/* Content area: kanban + optional info panel */}
      <div className="flex flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full">
              {columns.map((column) => {
                const colTickets = ticketsByColumn.get(column.id) ?? [];
                return (
                  <BoardColumnView
                    key={column.id}
                    column={column}
                    tickets={colTickets}
                    prefix={config.prefix}
                    boardSlug={boardSlug}
                    onTicketClick={openEditDialog}
                  />
                );
              })}
            </div>
          </div>

          <BoardOverlay
            activeId={activeId}
            tickets={tickets}
            columns={columns}
            prefix={config.prefix}
          />
        </DndContext>

        {infoOpen && (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto">
            <PageInfoPanel
              key={`info-${boardFilePath}`}
              filePath={boardFilePath}
              title={config.name}
              onClose={() => {
                setInfoOpen(false);
                localStorage.removeItem("kumidocs:info-open");
              }}
            />
          </div>
        )}
      </div>

      {/* Ticket dialog */}
      <TicketDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        boards={boardNameMap}
        boardColumns={new Map([[boardSlug, columns]])}
        initialBoardSlug={boardSlug}
        ticket={editTicket}
        users={dialogUsers.emails}
        displayNames={dialogUsers.displayNames}
        onCreated={reloadTickets}
        onSaved={reloadTickets}
      />
    </div>
  );
}

export default BoardPage;
