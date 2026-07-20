import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SLIDE_H, SLIDE_W } from "@/components/editor/slides/constants";
import { ScaledSlide, SlideViewer } from "@/components/editor/slides/viewer";
import type { SlideThemeDef, SlideThemeMap } from "@/lib/slide";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { parseSlideDirectives } from "@/lib/slide";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useUser } from "@/store/user";
import useMountEffect from "@/hooks/use-mount-effect";

interface OutletCtx {
  instanceName: string;
}

const CARD_W = 320;
const CARD_SCALE = CARD_W / SLIDE_W;
const CARD_H = Math.round(SLIDE_H * CARD_SCALE);

interface BuiltInTheme {
  description: string;
  id: string;
  name: string;
}

const BUILTIN_THEMES: BuiltInTheme[] = [
  { description: "Follows site light / dark mode", id: "default", name: "Default" },
  { description: "Near-black background, light text", id: "dark", name: "Dark" },
  { description: "Navy blue background", id: "corporate", name: "Corporate" },
  { description: "Soft off-white, minimal chrome", id: "minimal", name: "Minimal" },
  { description: "Purple-to-pink gradient", id: "gradient", name: "Gradient" },
];

const STANDARD_LAYOUTS = new Set([
  "title",
  "section",
  "split",
  "center",
  "invert",
  "blank",
  "default",
]);

const generateDemoMarkdown = (name: string, customDef?: SlideThemeDef): string => {
  const slides = [
    `<!-- class: title -->\n# ${name}\n\nYour collaborative wiki and presentation platform.`,
    `# Key Features\n\n- Real-time collaboration with presence\n- Markdown-first rich presentations\n- Custom themes via \`.kumidocs.json\``,
    `<!-- class: section -->\n## Getting Started`,
    `<!-- class: split -->\n## What We Do\n\nLeft column content.\n\n## How We Do It\n\nRight column content.`,
  ];
  if (customDef?.layouts !== undefined) {
    for (const layoutKey of Object.keys(customDef.layouts)) {
      if (!STANDARD_LAYOUTS.has(layoutKey)) {
        slides.push(`<!-- class: ${layoutKey} -->\n# ${layoutKey}\n\nCustom layout variant.`);
      }
    }
  }
  return slides.join("\n\n---\n\n");
};

interface ThemeCardProps {
  id: string;
  name: string;
  description: string;
  custom?: SlideThemeDef;
  slideThemes: SlideThemeMap;
  onClick: () => void;
}

const ThemeCard = (allProps: ThemeCardProps): JSX.Element => {
  const { id, name, description, custom, slideThemes, onClick } = allProps;
  const titleSlide = parseSlideDirectives(`<!-- class: title -->\n# ${name}\n\n${description}`);
  return (
    <button type="button" className="flex flex-col gap-2 text-left group" onClick={onClick}>
      <div className="rounded-md overflow-hidden border border-border shadow-sm group-hover:border-primary/50 group-hover:shadow-md transition-[box-shadow,border-color]">
        <div style={{ height: CARD_H, overflow: "hidden", position: "relative", width: CARD_W }}>
          <ScaledSlide
            slide={titleSlide}
            scale={CARD_SCALE}
            theme={id}
            paginate={false}
            slideNum={1}
            total={1}
            slideThemes={slideThemes}
            origin="top left"
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{name}</p>
          <p className="truncate">{description}</p>
        </div>
        {custom && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            custom
          </Badge>
        )}
      </div>
    </button>
  );
};

interface ActiveItem {
  id: string;
  name: string;
  custom?: SlideThemeDef;
}

interface ThemeDialogProps {
  active: ActiveItem | undefined;
  open: boolean;
  onClose: () => void;
  slideThemes: SlideThemeMap;
  demoMarkdown: string;
}

const ThemeDialog = (allProps: ThemeDialogProps): JSX.Element => {
  const { active, open, onClose, slideThemes, demoMarkdown } = allProps;
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
        className="max-w-5xl w-full p-0 gap-0 overflow-hidden flex flex-col h-[85vh]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            {active && <span className="font-bold">{active.name}</span>}
            {active && active.custom && (
              <Badge variant="secondary" className="text-xs">
                custom
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {active && (
            <SlideViewer
              value={demoMarkdown}
              theme={active.id}
              slideThemes={slideThemes}
              paginate
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface ThemesGridProps {
  slideThemes: SlideThemeMap;
  customEntries: [string, SlideThemeDef][];
  onSelect: (item: ActiveItem) => void;
}

const ThemesGrid = (allProps: ThemesGridProps): JSX.Element => {
  const { slideThemes, customEntries, onSelect } = allProps;
  const colStyle = { gridTemplateColumns: `repeat(auto-fill, ${String(CARD_W)}px)` };
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">Built-in</h2>
      <div className="grid gap-6 mb-8" style={colStyle}>
        {BUILTIN_THEMES.map(
          (theme): JSX.Element => (
            <ThemeCard
              key={theme.id}
              id={theme.id}
              name={theme.name}
              description={theme.description}
              slideThemes={slideThemes}
              onClick={(): void => {
                onSelect({ id: theme.id, name: theme.name });
              }}
            />
          ),
        )}
      </div>
      {customEntries.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">
            Custom (.kumidocs.json)
          </h2>
          <div className="grid gap-6" style={colStyle}>
            {customEntries.map(
              ([id, def]): JSX.Element => (
                <ThemeCard
                  key={id}
                  id={id}
                  name={id}
                  description={def.bg ?? "Custom theme"}
                  custom={def}
                  slideThemes={slideThemes}
                  onClick={(): void => {
                    onSelect({ custom: def, id, name: id });
                  }}
                />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
};

const SlideThemesPage = (): JSX.Element => {
  const { slideThemes } = useUser();
  const { instanceName } = useOutletContext<OutletCtx>();
  const [active, setActive] = useState<ActiveItem>();
  const [dialogOpen, setDialogOpen] = useState(false);

  useMountEffect(() => {
    document.title = `Slide Themes | ${instanceName}`;
  });
  const customEntries = Object.entries(slideThemes);
  const total = BUILTIN_THEMES.length + customEntries.length;
  let themeLabel = "themes";
  if (total === 1) {
    themeLabel = "theme";
  }
  let demoMarkdown = "";
  if (active) {
    demoMarkdown = generateDemoMarkdown(active.name, active.custom);
  }
  const handleSelect = (item: ActiveItem): void => {
    setActive(item);
    setDialogOpen(true);
  };
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-xl font-bold flex-1">Slide Themes</h1>
        <span className="text-sm text-muted-foreground">
          {total} {themeLabel}
        </span>
      </div>
      <ThemesGrid slideThemes={slideThemes} customEntries={customEntries} onSelect={handleSelect} />
      <ThemeDialog
        active={active}
        open={dialogOpen}
        onClose={(): void => {
          setDialogOpen(false);
        }}
        slideThemes={slideThemes}
        demoMarkdown={demoMarkdown}
      />
    </div>
  );
};

export default SlideThemesPage;
