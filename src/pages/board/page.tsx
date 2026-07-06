import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { getFile, getTree, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig, TicketData } from "@/lib/board";
import { displayColumnId, parseTicketYaml, ticketToYaml, yamlToBoard } from "@/lib/board";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Info } from "lucide-react";
import TicketDialog from "@/components/dialogs/ticket-dialog";
import ICONS from "@/components/ui/icon/fluent";
import type { PresenceUser } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import PageInfoPanel from "@/components/layout/page-info-panel";
import usePagePresence from "@/hooks/use-page-presence";
import useInfoPanel from "@/hooks/use-info-panel";
import { useUser } from "@/store/user";
import type { JSX } from "react";

interface OutletCtx {
  instanceName: string;
}

// ── Sortable ticket card ───────────────────────────────────────────

interface TicketCardProps {
  ticket: TicketData;
  prefix: string;
  boardSlug: string;
  onClick: () => void;
  columnColor: string;
}

function TicketCard({
  ticket,
  prefix,
  boardSlug,
  onClick,
  columnColor,
}: TicketCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${boardSlug}/${ticket.id}`,
  });

  const style = {
    opacity: isDragging ? 0.4 : undefined,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card text-sm shadow-xs"
    >
      {/* Drag handle row */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing text-muted-foreground"
      >
        <GripVertical className="w-3 h-3 shrink-0" />
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: columnColor }} />
        <span className="text-xs font-mono text-muted-foreground">
          {prefix}-{ticket.id}
        </span>
      </div>

      {/* Clickable body */}
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-3 pb-2.5 hover:bg-accent/50 transition-colors rounded-b-lg"
      >
        <p className="text-foreground leading-snug line-clamp-2">{ticket.title}</p>
      </button>
    </div>
  );
}

// ── Column component ───────────────────────────────────────────────

interface ColumnProps {
  column: BoardColumn;
  tickets: TicketData[];
  prefix: string;
  boardSlug: string;
  onTicketClick: (ticket: TicketData) => void;
}

function BoardColumnView({
  column,
  tickets,
  prefix,
  boardSlug,
  onTicketClick,
}: ColumnProps): JSX.Element {
  const { setNodeRef: dropRef } = useDroppable({
    id: `${boardSlug}/${column.id}`,
  });

  return (
    <div
      ref={dropRef}
      className="flex flex-col w-72 shrink-0 border-r border-border last:border-r-0"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color }}
        />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {displayColumnId(column.id)}
        </span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">{tickets.length}</span>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 px-2 py-2 min-h-[4rem]">
        {tickets.length === 0 && (
          <div className="px-1 py-6 text-xs text-muted-foreground text-center">No tickets</div>
        )}
        {tickets.map((ticket) => (
          <TicketCard
            key={`${boardSlug}/${ticket.id}`}
            ticket={ticket}
            prefix={prefix}
            boardSlug={boardSlug}
            columnColor={column.color}
            onClick={() => {
              onTicketClick(ticket);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Board page ─────────────────────────────────────────────────────

function BoardPage(): JSX.Element {
  const { name } = useParams<{ name: string }>();
  const boardSlug = name ?? "";
  const { instanceName: _instanceName } = useOutletContext<OutletCtx>();
  const { user } = useUser();

  const [config, setConfig] = useState<BoardConfig | undefined>(undefined);
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<
    { boardSlug: string; ticketId: string; title: string; body: string; column: string } | undefined
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
    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const resp = await getFile(`${boardSlug}.yaml`);
        const boardConfig = await yamlToBoard(resp.content);
        if (!boardConfig) {
          setLoading(false);
          return;
        }
        setConfig(boardConfig);

        const tree = await getTree();
        const boardDir = tree.find((node) => node.type === "dir" && node.name === boardSlug);
        const ticketNodes =
          boardDir?.children?.filter(
            (child) => child.type === "file" && child.path.endsWith(".yaml"),
          ) ?? [];

        const loaded = await Promise.all(
          ticketNodes.map(async (node) => {
            const ticketId = node.name.replace(/\.yaml$/u, "");
            try {
              const fileResp = await getFile(node.path);
              return await parseTicketYaml(fileResp.content, boardSlug, ticketId);
            } catch {
              return { boardSlug, column: "", id: ticketId, title: ticketId };
            }
          }),
        );
        setTickets(loaded);
      } catch {
        setConfig(undefined);
      } finally {
        setLoading(false);
      }
    };
    void load();
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
        const ln = Number(left.id);
        const rn = Number(right.id);
        if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
          return ln - rn;
        }
        return left.id.localeCompare(right.id);
      });
    }
    return map;
  }, [tickets, columns, defaultColumnId]);

  // Dialog handlers
  const handleDialogClose = useCallback((): void => {
    setDialogOpen(false);
    setEditTicket(undefined);
  }, []);

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
      const loaded = await Promise.all(
        ticketNodes.map(async (node) => {
          const ticketId = node.name.replace(/\.yaml$/u, "");
          try {
            const fileResp = await getFile(node.path);
            return await parseTicketYaml(fileResp.content, boardSlug, ticketId);
          } catch {
            return { boardSlug, column: "", id: ticketId, title: ticketId };
          }
        }),
      );
      setTickets(loaded);
    } catch {
      // ignore
    }
  }, [boardSlug]);

  const handleDialogSaved = useCallback((): void => {
    void reloadTickets();
  }, [reloadTickets]);

  const handleDialogCreated = useCallback((): void => {
    void reloadTickets();
  }, [reloadTickets]);

  // Open edit dialog for a ticket
  const openEditDialog = useCallback(async (ticket: TicketData): Promise<void> => {
    try {
      const resp = await getFile(`${ticket.boardSlug}/${ticket.id}.yaml`);
      const data = await parseTicketYaml(resp.content, ticket.boardSlug, ticket.id);
      setEditTicket({
        boardSlug: data.boardSlug,
        body: "",
        column: data.column,
        ticketId: data.id,
        title: data.title,
      });
    } catch {
      setEditTicket({
        boardSlug: ticket.boardSlug,
        body: "",
        column: ticket.column,
        ticketId: ticket.id,
        title: ticket.title,
      });
    }
    setDialogOpen(true);
  }, []);

  // Handle drag end (move ticket between columns)
  const handleDragEnd = useCallback(
    async (event: DragEndEvent): Promise<void> => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      const activeTicket = tickets.find((tic) => `${tic.boardSlug}/${tic.id}` === activeId);
      if (!activeTicket) {
        return;
      }

      // Target is a droppable column: "boardSlug/columnId"
      const targetColId = overId.replace(`${boardSlug}/`, "");

      if (!targetColId || targetColId === activeTicket.column) {
        return;
      }

      try {
        const path = `${activeTicket.boardSlug}/${activeTicket.id}.yaml`;
        const fileResp = await getFile(path);
        const data = await parseTicketYaml(
          fileResp.content,
          activeTicket.boardSlug,
          activeTicket.id,
        );
        const yaml = ticketToYaml({ column: targetColId, title: data.title });
        await putFile(path, yaml);
        setTickets((prev) =>
          prev.map((tic) =>
            `${tic.boardSlug}/${tic.id}` === activeId ? { ...tic, column: targetColId } : tic,
          ),
        );
      } catch {
        // will revert on next reload
      }
    },
    [tickets, boardSlug],
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Board not found
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Board header */}
      <div className="flex items-center gap-2 px-4 py-1 border-b border-border shrink-0">
        <span
          className="w-6 h-6 shrink-0"
          dangerouslySetInnerHTML={{ __html: ICONS.Board24Color ?? "" }}
        />
        <div className="flex flex-col min-w-0">
          <h1 className="font-semibold text-base truncate">{config.name}</h1>
          <div className="flex items-center gap-1 text-xs -mt-1">
            <span className="text-muted-foreground tabular-nums">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </span>
          </div>
        </div>

        {/* Right: viewers + info */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div className="flex -space-x-1">
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

          <Button
            size="sm"
            variant={infoOpen ? "secondary" : "ghost"}
            className="h-7 gap-1 text-xs px-2"
            onClick={() => {
              setInfoOpen(!infoOpen);
            }}
          >
            <Info className="w-4 h-4" />
            Info
          </Button>
        </div>
      </div>

      {/* Content area: kanban + optional info panel */}
      <div className="flex flex-1 overflow-hidden">
        <DndContext onDragEnd={handleDragEnd}>
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
        initialBoardSlug={boardSlug}
        ticket={editTicket}
        onCreated={handleDialogCreated}
        onSaved={handleDialogSaved}
      />
    </div>
  );
}

export default BoardPage;
