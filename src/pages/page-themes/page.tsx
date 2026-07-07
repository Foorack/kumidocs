import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { PageTemplateDef } from "@/lib/page";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useUser } from "@/store/user";
import PageViewer from "@/components/viewer/page-viewer";
import useMountEffect from "@/hooks/use-mount-effect";

const A4_W = 794;
const CARD_W = 320;
const CARD_SCALE = CARD_W / A4_W;
const CARD_H = Math.round(540 * CARD_SCALE);

const DEMO_MARKDOWN = `# Q5 Linux Announcement

## Summary

Q5 was a strong quarter for the company. Revenue grew 23% year-over-year, and we exceeded our targets across all major business units.

**Target date:** Aprox 2096. 😀

---

_This announcement is intended for internal distribution only. For questions, contact the CEO Office._`;

interface OutletCtx {
  instanceName: string;
}

interface TemplateCardProps {
  name: string;
  template: PageTemplateDef;
  onClick: () => void;
}

const TemplateCard = (allProps: TemplateCardProps): JSX.Element => {
  const { name, template, onClick } = allProps;
  return (
    <button type="button" className="flex flex-col gap-2 text-left group" onClick={onClick}>
      <div className="rounded-md overflow-hidden border border-border shadow-sm group-hover:border-primary/50 group-hover:shadow-md transition-[box-shadow,border-color]">
        <div style={{ height: CARD_H, overflow: "hidden", position: "relative", width: CARD_W }}>
          <div
            style={{ transform: `scale(${CARD_SCALE})`, transformOrigin: "top left", width: A4_W }}
          >
            <PageViewer value={DEMO_MARKDOWN} template={template} title={name} />
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{name}</p>
          {template.description !== undefined && template.description !== "" && (
            <p className="truncate">{template.description}</p>
          )}
        </div>
      </div>
    </button>
  );
};

interface TemplateDialogProps {
  name: string | undefined;
  template: PageTemplateDef | undefined;
  open: boolean;
  onClose: () => void;
}

const TemplateDialog = (allProps: TemplateDialogProps): JSX.Element => {
  const { name, template, open, onClose } = allProps;
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen: boolean): void => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl max-w-5xl w-full p-0 gap-0 overflow-hidden flex flex-col h-[85vh]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="font-semibold">{name ?? "Template"}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <ScrollArea className="flex-1">
          {template && (
            <PageViewer value={DEMO_MARKDOWN} template={template} title={name ?? "Template"} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

const PageThemesPage = (): JSX.Element => {
  const { pageTemplates } = useUser();
  const { instanceName } = useOutletContext<OutletCtx>();
  const [selectedName, setSelectedName] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  useMountEffect(() => {
    document.title = `Page Themes | ${instanceName}`;
  });

  const entries = Object.entries(pageTemplates);
  const total = entries.length;
  let label = "templates";
  if (total === 1) {
    label = "template";
  }

  const handleSelect = (name: string): void => {
    setSelectedName(name);
    setDialogOpen(true);
  };

  const colStyle = { gridTemplateColumns: `repeat(auto-fill, ${String(CARD_W)}px)` };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold flex-1">Page Themes</h1>
        <span>
          {total} {label}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {entries.length === 0 ? (
          <p className="text-center py-12">
            No page templates defined in <code>.kumidocs.json</code>.
          </p>
        ) : (
          <div className="grid gap-6" style={colStyle}>
            {entries.map(([name, def]) => (
              <TemplateCard
                key={name}
                name={name}
                template={def}
                onClick={() => {
                  handleSelect(name);
                }}
              />
            ))}
          </div>
        )}
      </div>
      <TemplateDialog
        name={selectedName}
        template={
          selectedName !== undefined && selectedName !== ""
            ? pageTemplates[selectedName]
            : undefined
        }
        open={dialogOpen}
        onClose={(): void => {
          setDialogOpen(false);
        }}
      />
    </div>
  );
};

export default PageThemesPage;
