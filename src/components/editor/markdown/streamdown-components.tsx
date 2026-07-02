import { defaultRehypePlugins } from "streamdown";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import type { PluggableList } from "unified";
import type { ReactNode } from "react";
import { harden } from "rehype-harden";
import { Pages, Toc, Tree } from "./tree-components";
import { usePageContext } from "@/lib/page-context";
import rehypeEmojiPlugin from "@/components/editor/plugins/emoji";
import rehypeGfmAlertsPlugin from "@/components/editor/plugins/gfm-alerts";
import rehypeHeadingIdsPlugin from "@/components/editor/plugins/heading-ids";
import rehypeResolveRelativeUrlsPlugin from "@/components/editor/plugins/resolve-relative-urls";
import rehypeTreeDirective from "@/components/editor/plugins/tree-directive";

/** Allowed URL prefixes for images (rehype-harden + slide CSS validation) */
const ALLOWED_IMAGE_PREFIXES = ["/images/", "data:image/"];
/** Allowed URL to LINK to anywhere */
const ALLOWED_LINK_PREFIXES = ["*"];

// Shared rehype plugins

const sanitizePlugin = defaultRehypePlugins.sanitize;
if (!sanitizePlugin) {
  throw new Error("Streamdown sanitize plugin is not available");
}

/** Resolve relative URLs against the current page origin. */
const LOCAL = "http://localhost:5864";
// oxlint-disable-next-line typescript/no-unnecessary-condition
const DEFAULT_ORIGIN = globalThis.location === undefined ? LOCAL : globalThis.location.origin;

const REHYPE_PLUGINS: PluggableList = [
  sanitizePlugin,
  rehypeResolveRelativeUrlsPlugin,
  [
    harden,
    {
      allowDataImages: true,
      allowedImagePrefixes: ALLOWED_IMAGE_PREFIXES,
      allowedLinkPrefixes: ALLOWED_LINK_PREFIXES,
      allowedProtocols: ["mailto", "https"],
      defaultOrigin: DEFAULT_ORIGIN,
    },
  ],
  rehypeHeadingIdsPlugin,
  rehypeEmojiPlugin,
  rehypeGfmAlertsPlugin,
  rehypeTreeDirective,
];

// KumiEmojiComponent

interface KumiEmojiProps {
  node?: unknown;
}

const KumiEmojiComponent = (allProps: KumiEmojiProps): JSX.Element => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const typedNode = allProps.node as { properties?: { dataEmoji?: unknown } } | undefined;
  const raw = typedNode?.properties?.dataEmoji;
  let emoji = "";
  if (typeof raw === "string") {
    emoji = raw;
  }
  if (!emoji) {
    return <></>;
  }
  return (
    <EmojiIcon
      emoji={emoji}
      size="1.07lh"
      className="align-middle"
      style={{ display: "inline-flex", transform: "translateY(-10%)" }}
    />
  );
};

// Anchor components

interface AnchorProps {
  href?: string;
  children?: ReactNode;
}

/**
 * Resolve the href/target for a rendered link. Fragment links always target
 * the current page. Other links open in a new tab while editing (so you
 * don't lose the editor) and in the same tab while viewing.
 */
function resolveAnchor(
  href: string | undefined,
  editMode: boolean,
): { href?: string; target: string } {
  if (href?.startsWith("#") === true) {
    // Prepend the current page path so fragment links resolve to headings on
    // the current page instead of root (broken by harden's defaultOrigin).
    return { href: window.location.pathname + href, target: "_self" };
  }
  return { href, target: editMode ? "_blank" : "_self" };
}

/** Anchor for document (non-slide) markdown - includes text-primary colour. */
const AnchorComponent = (allProps: AnchorProps): JSX.Element => {
  const { href, children } = allProps;
  const { editMode } = usePageContext();
  const resolved = resolveAnchor(href, editMode);
  return (
    <a
      className="wrap-anywhere font-medium text-primary underline"
      data-incomplete="false"
      data-streamdown="link"
      href={resolved.href}
      rel="noopener noreferrer"
      target={resolved.target}
    >
      {children}
    </a>
  );
};

/** Anchor for slide markdown - same as AnchorComponent but without text-primary. */
const SlideAnchorComponent = (allProps: AnchorProps): JSX.Element => {
  const { href, children } = allProps;
  const { editMode } = usePageContext();
  const resolved = resolveAnchor(href, editMode);
  return (
    <a
      className="wrap-anywhere font-medium text-primary underline"
      data-incomplete="false"
      data-streamdown="link"
      href={resolved.href}
      rel="noopener noreferrer"
      target={resolved.target}
    >
      {children}
    </a>
  );
};

// Image component

interface ImgComponentProps {
  src?: string;
  alt?: string;
  title?: string;
}

/**
 * Parse Marp-compatible image size keywords from alt text.
 *
 * Supports:
 *   ![width:200px](img.jpg)
 *   ![w:32 h:32](img.jpg)
 *   ![alt text w:300px](img.jpg)
 *   ![height:30cm](img.jpg)
 *
 * Keywords are stripped from the rendered alt text.
 */
function parseMarpSize(alt: string): { cleanAlt: string; marpWidth?: string; marpHeight?: string } {
  const RE =
    /(?<key>width|height|w|h)\s*:\s*(?<value>[\d.]+(?:px|cm|mm|in|pt|pc|em|rem|%|auto)?)\s*/giu;
  let marpWidth: string | undefined;
  let marpHeight: string | undefined;

  let match: RegExpExecArray | null;
  while ((match = RE.exec(alt)) !== null) {
    const key = (match[1] ?? "").toLowerCase();
    const val = match[2] ?? "";
    if (key === "width" || key === "w") {
      marpWidth = val;
    } else if (key === "height" || key === "h") {
      marpHeight = val;
    }
  }

  const cleanAlt = alt.replaceAll(RE, "").replaceAll(/\s+/gu, " ").trim();
  return { cleanAlt, marpHeight, marpWidth };
}

const ImgComponent = (allProps: ImgComponentProps): JSX.Element => {
  const { src, alt = "", title } = allProps;
  const { cleanAlt, marpHeight, marpWidth } = parseMarpSize(alt);

  const style: React.CSSProperties = {};
  if (marpWidth !== undefined && marpWidth !== "") {
    style.width = marpWidth;
  }
  if (marpHeight !== undefined && marpHeight !== "") {
    style.height = marpHeight;
  }

  const hasMarpStyle =
    (marpWidth !== undefined && marpWidth !== "") ||
    (marpHeight !== undefined && marpHeight !== "");

  return (
    <img
      src={src}
      alt={cleanAlt}
      title={title}
      className="max-w-full h-auto"
      style={hasMarpStyle ? style : undefined}
      loading="lazy"
    />
  );
};

// GFM Alert component

interface KumiAlertProps {
  node?: unknown;
  children?: ReactNode;
}

const ALERT_LABELS: Record<string, string> = {
  CAUTION: "Caution",
  IMPORTANT: "Important",
  NOTE: "Note",
  TIP: "Tip",
  WARNING: "Warning",
};

const ALERT_ICONS: Record<string, string> = {
  CAUTION: "\uD83C\uDD98",
  IMPORTANT: "\u2611\uFE0F",
  NOTE: "\u2139\uFE0F",
  TIP: "\uD83D\uDD30",
  WARNING: "\uD83D\uDEB8",
};

const ALERT_CLASSES: Record<string, string> = {
  CAUTION: "border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200",
  IMPORTANT:
    "border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-800 dark:text-purple-200",
  NOTE: "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
  TIP: "border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200",
  WARNING: "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200",
};

const KumiAlert = (allProps: KumiAlertProps): JSX.Element => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const nodeData = allProps.node as { properties?: { dataAlertType?: unknown } } | undefined;
  const rawType = nodeData?.properties?.dataAlertType;
  const alertType = typeof rawType === "string" ? rawType : "NOTE";
  const label = ALERT_LABELS[alertType] ?? "Note";
  const classes = ALERT_CLASSES[alertType] ?? ALERT_CLASSES.NOTE;
  const emoji = ALERT_ICONS[alertType] ?? ALERT_ICONS.NOTE;
  return (
    <div
      style={{
        borderBottomRightRadius: "8px",
        borderLeft: "10px solid",
        borderTopRightRadius: "8px",
        marginBottom: "16px",
        marginTop: "16px",
        padding: "12px 20px",
      }}
      className={classes}
      role="alert"
    >
      <div
        style={{
          alignItems: "center",
          color: "inherit",
          display: "flex",
          fontWeight: 600,
          gap: "12px",
          lineHeight: 1,
          marginBottom: "12px",
          marginTop: "8px",
        }}
      >
        <EmojiIcon emoji={emoji} size="28px" />
        <span>{label}</span>
      </div>
      {allProps.children}
    </div>
  );
};

// Component maps

/** Component map for document (non-slide) markdown viewer. */
// oxfmt-ignore
// oxlint-disable-next-line id-length
const COMPONENTS_DOC: Record<string, (props: Record<string, unknown>) => JSX.Element> = {
  // oxlint-disable-next-line id-length
  a: AnchorComponent,
  img: ImgComponent,
  "kumi-alert": KumiAlert,
  "kumi-emoji": KumiEmojiComponent,
  "pages": Pages,
  "toc": Toc,
  "tree": Tree,
};

/** Component map for slide markdown viewer. */
// oxfmt-ignore
// oxlint-disable-next-line id-length
const COMPONENTS_SLIDE: Record<string, (props: Record<string, unknown>) => JSX.Element> = {
  // oxlint-disable-next-line id-length
  a: SlideAnchorComponent,
  img: ImgComponent,
  "kumi-alert": KumiAlert,
  "kumi-emoji": KumiEmojiComponent,
  // oxlint-disable-next-line id-length, typescript/no-unsafe-type-assertion
  p: (props: Record<string, unknown>): JSX.Element => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const { children } = props as { children?: ReactNode };
    return <p style={{ margin: 0 }}>{children}</p>;
  },
  "pages": Pages,
  "toc": Toc,
  "tree": Tree,
};

export {
  ALLOWED_IMAGE_PREFIXES as ALLOWED_BG_URL_PREFIXES,
  ALLOWED_LINK_PREFIXES,
  AnchorComponent,
  COMPONENTS_DOC,
  COMPONENTS_SLIDE,
  ImgComponent,
  KumiAlert,
  KumiEmojiComponent,
  Pages,
  REHYPE_PLUGINS,
  SlideAnchorComponent,
  Toc,
  Tree,
};
