import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { getFile, getTree, putFile } from "@/lib/api";
import type { BoardConfig, TicketData } from "@/lib/board";
import { displayColumnId, parseTicketYaml, ticketToYaml, yamlToBoard } from "@/lib/board";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Info } from "lucide-react";
import { EmojiIcon } from "@/components/ui/emoji-icon";
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
import BoardColumnView from "./column";
import BoardOverlay from "./board-overlay";

interface OutletCtx {
  instanceName: string;
}

// Board page

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
        const path = `${dragActiveTicket.boardSlug}/${dragActiveTicket.id}.yaml`;
        const fileResp = await getFile(path);
        const data = await parseTicketYaml(
          fileResp.content,
          dragActiveTicket.boardSlug,
          dragActiveTicket.id,
        );
        const yaml = ticketToYaml({ column: targetColId, title: data.title });
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
    [tickets, boardSlug],
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
      <div className="flex items-center gap-2 px-4 py-1 border-b border-border shrink-0">
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
        onCreated={handleDialogCreated}
        onSaved={handleDialogSaved}
      />
    </div>
  );
}

export default BoardPage;
