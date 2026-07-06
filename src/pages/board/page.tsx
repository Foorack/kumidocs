import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { getFile, getTree, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig, TicketData } from "@/lib/board";
import { displayColumnId, parseTicketYaml, ticketToYaml, yamlToBoard } from "@/lib/board";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import TicketDialog from "@/components/dialogs/ticket-dialog";
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${boardSlug}/${ticket.id}`,
  });

  const style = {
    opacity: isDragging ? 0.4 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      className="w-full text-left rounded-lg border border-border bg-card px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors shadow-xs"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: columnColor }} />
        <span className="text-xs font-mono text-muted-foreground">
          {prefix}-{ticket.id}
        </span>
      </div>
      <p className="text-foreground leading-snug line-clamp-2">{ticket.title}</p>
    </button>
  );
}

// ── Column component ───────────────────────────────────────────────

interface ColumnProps {
  column: BoardColumn;
  tickets: TicketData[];
  prefix: string;
  boardSlug: string;
  onTicketClick: (ticket: TicketData) => void;
  onNewTicket: () => void;
}

function BoardColumnView({
  column,
  tickets,
  prefix,
  boardSlug,
  onTicketClick,
  onNewTicket,
}: ColumnProps): JSX.Element {
  return (
    <div className="flex flex-col w-72 shrink-0 border-r border-border last:border-r-0">
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
        <SortableContext
          items={tickets.map((t) => `${boardSlug}/${t.id}`)}
          strategy={verticalListSortingStrategy}
        >
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
        </SortableContext>
      </div>

      {/* New ticket button */}
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onNewTicket}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add ticket
        </button>
      </div>
    </div>
  );
}

// ── Board page ─────────────────────────────────────────────────────

function BoardPage(): JSX.Element {
  const { name } = useParams<{ name: string }>();
  const boardSlug = name ?? "";
  const { instanceName: _instanceName } = useOutletContext<OutletCtx>();

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

  // Open create dialog for a specific column
  const openCreateDialog = useCallback((_columnId: string): void => {
    setEditTicket(undefined);
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
      const activeTicket = tickets.find((t) => `${t.boardSlug}/${t.id}` === activeId);
      if (!activeTicket) {
        return;
      }

      // Determine target column
      const overTicket = tickets.find((t) => `${t.boardSlug}/${t.id}` === overId);
      const targetColId = overTicket?.column ?? "";

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
          prev.map((t) =>
            `${t.boardSlug}/${t.id}` === activeId ? { ...t, column: targetColId } : t,
          ),
        );
      } catch {
        // will revert on next reload
      }
    },
    [tickets],
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
      <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">{config.name}</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
        </span>
      </div>

      {/* Kanban columns */}
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full">
            {columns.map((col) => {
              const colTickets = ticketsByColumn.get(col.id) ?? [];
              return (
                <BoardColumnView
                  key={col.id}
                  column={col}
                  tickets={colTickets}
                  prefix={config.prefix}
                  boardSlug={boardSlug}
                  onTicketClick={openEditDialog}
                  onNewTicket={() => {
                    openCreateDialog(col.id);
                  }}
                />
              );
            })}
          </div>
        </div>
      </DndContext>

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
