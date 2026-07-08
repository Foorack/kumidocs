/** Page template types: single-page A4 document templates with branded elements. */

/** A page template definition, stored in .kumidocs.json under `pageTemplates`. */
interface PageTemplateDef {
  /**
   * Raw HTML template string.
   * Use `{{content}}` to inject the rendered markdown body.
   * `{{title}}`, `{{date}}`, and custom `{{pageVars}}` are also interpolated.
   * CSS in the template is inlined via juice when the user copies as HTML.
   */
  template: string;
  /** Optional human-readable description shown in the Page Themes grid. */
  description?: string;
}

type PageTemplateMap = Record<string, PageTemplateDef>;

/**
 * Resolve a page template definition from the template map.
 * Returns undefined if the template name is not found.
 */
function resolvePageTemplate(
  pageTemplates: PageTemplateMap | undefined,
  templateName: string,
): PageTemplateDef | undefined {
  if (pageTemplates === undefined) {
    return undefined;
  }
  return pageTemplates[templateName];
}

export type { PageTemplateDef, PageTemplateMap };
export { resolvePageTemplate };
