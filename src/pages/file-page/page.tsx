import ErrorBanner from "@/components/ui/error-banner";
import FilePageHeader from "./header";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import NotFound from "@/pages/not-found/page";
import PageInfoPanel from "@/components/layout/page-info-panel";
import { PageContextProvider } from "@/lib/page-context";
import TocSidebar from "@/components/editor/markdown/toc-sidebar";
import { buildEditorContent } from "./utils";
import { useFilePage } from "./use-page";
import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import type { OutletCtx } from "./use-page";
import type { PageViewerHandle } from "@/components/viewer/page-viewer";

export default function FilePage(): JSX.Element {
  const { tree } = useOutletContext<OutletCtx>();
  const {
    rawPath,
    filePath,
    user,
    slideThemes,
    pageTemplates,
    content,
    rawContent,
    meta,
    setMeta,
    manualSaveOnly,
    saveStatus,
    loading,
    notFound,
    metaRef,
    toggleManualSaveOnly,
    loadDoc,
    handleChange,
    handleSave,
    editMode,
    editLocked,
    viewers,
    infoOpen,
    setInfoOpen,
    tocOpen,
    setTocOpen,
    remoteBanner,
    setRemoteBanner,
    resolvedContent,
    pdfContentRef,
    openMove,
    openDelete,
    pageActionDialogs,
    enterEdit,
    exitEdit,
    handleEmojiChange,
    handlePageDuplicate,
    exportPagePdf,
    fileType,
    title,
    rawExt,
    breadcrumb,
    saveError,
    loadError,
    duplicateError,
    setDuplicateError,
    conflictBanner,
    setConflictBanner,
  } = useFilePage();

  // Warn before closing/tab away if there are unsaved changes.
  useEffect(() => {
    if (saveStatus !== "unsaved") {
      return;
    }
    const handler = (ev: BeforeUnloadEvent): void => {
      ev.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    // oxlint-disable-next-line typescript/consistent-return
    return function cleanup(): void {
      window.removeEventListener("beforeunload", handler);
    };
  }, [saveStatus]);

  const pageViewerRef = useRef<PageViewerHandle>(null);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center">Loading…</div>;
  }

  if (notFound) {
    return <NotFound />;
  }

  const editorContent = buildEditorContent({
    content,
    editMode,
    fileType,
    handleChange,
    handleSave,
    meta,
    metaRef,
    pageTemplates,
    pageViewerRef,
    rawContent,
    rawExt,
    resolvedContent,
    setMeta,
    slideThemes,
    title,
  });

  return (
    <PageContextProvider pagePath={filePath} rawContent={content} tree={tree} editMode={editMode}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Error banners */}
        <ErrorBanner
          message={loadError}
          actions={[
            {
              label: "Retry",
              onClick: async () => {
                try {
                  await loadDoc(filePath);
                } catch {
                  // retry handled by loadDoc's own error handling
                }
              },
            },
          ]}
        />
        <ErrorBanner
          message={saveError}
          actions={[
            {
              label: "Retry Save",
              onClick: () => {
                void handleSave();
              },
            },
          ]}
        />
        <ErrorBanner
          message={duplicateError}
          actions={[
            {
              label: "Retry",
              onClick: () => {
                void handlePageDuplicate();
              },
            },
            {
              label: "Dismiss",
              onClick: () => {
                setDuplicateError(undefined);
              },
              variant: "ghost",
            },
          ]}
        />
        <ErrorBanner
          message={conflictBanner}
          actions={[
            {
              label: "Dismiss",
              onClick: () => {
                setConflictBanner(undefined);
              },
              variant: "ghost",
            },
          ]}
        />
        <ErrorBanner
          variant="warning"
          message={
            remoteBanner !== undefined && remoteBanner !== ""
              ? `${remoteBanner} while you have unsaved changes.`
              : remoteBanner
          }
          actions={[
            {
              label: "Reload",
              onClick: async () => {
                try {
                  await loadDoc(filePath);
                } catch (error: unknown) {
                  console.error("Failed to reload document:", error);
                }
                setRemoteBanner(undefined);
              },
            },
            {
              label: "Dismiss",
              onClick: () => {
                setRemoteBanner(undefined);
              },
              variant: "ghost",
            },
          ]}
        />

        {/* Page header */}
        <FilePageHeader
          meta={meta}
          fileType={fileType}
          title={title}
          breadcrumb={breadcrumb}
          user={user}
          editMode={editMode}
          editLocked={editLocked}
          viewers={viewers}
          manualSaveOnly={manualSaveOnly}
          saveStatus={saveStatus}
          toggleManualSaveOnly={toggleManualSaveOnly}
          infoOpen={infoOpen}
          tocOpen={tocOpen}
          rawPath={rawPath}
          filePath={filePath}
          handleEmojiChange={handleEmojiChange}
          exitEdit={exitEdit}
          enterEdit={enterEdit}
          setInfoOpen={setInfoOpen}
          setTocOpen={setTocOpen}
          handlePageDuplicate={() => {
            void handlePageDuplicate();
          }}
          exportPagePdf={() => {
            void exportPagePdf();
          }}
          onCopyHtml={
            fileType === "page"
              ? async () => {
                  await pageViewerRef.current?.copyHtml();
                }
              : undefined
          }
          openMove={openMove}
          openDelete={() => {
            openDelete(filePath);
          }}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden flex flex-col">{editorContent}</div>
          </div>
          {/* TOC sidebar: doc pages only, view mode */}
          {tocOpen && !editMode && fileType === "doc" && (
            <TocSidebar
              key={`toc-${filePath}`}
              content={content}
              onClose={() => {
                setTocOpen(false);
                localStorage.removeItem("kumidocs:toc-open");
              }}
            />
          )}
          {infoOpen && !editMode && (
            <PageInfoPanel
              key={`info-${filePath}`}
              filePath={filePath}
              title={title}
              onClose={() => {
                setInfoOpen(false);
                localStorage.removeItem("kumidocs:info-open");
              }}
            />
          )}
        </div>

        {/* Off-screen render container for PDF export */}
        {fileType === "doc" && (
          <div
            ref={pdfContentRef}
            aria-hidden="true"
            style={{
              left: 0,
              pointerEvents: "none",
              position: "fixed",
              top: 0,
              width: 800,
              zIndex: -9999,
            }}
          >
            <MarkdownViewer value={content} />
          </div>
        )}

        {/* Move + Delete dialogs (shared hook) */}
        {pageActionDialogs}
      </div>
    </PageContextProvider>
  );
}
