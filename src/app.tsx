import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "@/components/layout/app-shell";
import BoardDetailPage from "@/pages/board-detail/page";
import BoardListPage from "@/pages/board-list/page";
import BoardManagerPage from "@/pages/board-manager/page";
import BoardPage from "@/pages/board/page";
import EmojiPage from "@/pages/emoji/page";
import ErrorBoundary from "@/components/ui/error-boundary";
import FilePageRoute from "@/pages/file-page/route";
import FluentIconsPage from "@/pages/fluenticons/page";
import ImageLibraryPage from "@/pages/image-library/page";
import IconsPage from "@/pages/icons/page";
import NotFound from "@/pages/not-found/page";
import PageThemesPage from "@/pages/page-themes/page";
import Providers from "@/providers";
import SlideThemesPage from "@/pages/slide-themes/page";
import WelcomePage from "@/pages/welcome/page";
import { useUser } from "@/store/user";

function AppRoutes(): JSX.Element {
  const { mode, loading } = useUser();

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background text-foreground">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={mode === "board" ? "/b/" : "/p/README.md"} replace />}
      />
      <Route element={<AppShell />}>
        <Route path="/p" element={<PageThemesPage />} />
        <Route path="/p/*" element={<FilePageRoute />} />
        <Route path="/b" element={<BoardListPage />} />
        <Route path="/bm" element={<BoardManagerPage />} />
        <Route path="/bm/:name" element={<BoardDetailPage />} />
        <Route path="/b/:name/*" element={<BoardPage />} />
        <Route path="/i" element={<ImageLibraryPage />} />
        <Route path="/i/:filename" element={<ImageLibraryPage />} />
        <Route path="/emoji" element={<EmojiPage />} />
        <Route path="/icons" element={<IconsPage />} />
        <Route path="/fluenticons" element={<FluentIconsPage />} />
        <Route path="/s" element={<SlideThemesPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

const App = (): JSX.Element => (
  <BrowserRouter>
    <Providers>
      <ErrorBoundary label="page">
        <AppRoutes />
      </ErrorBoundary>
    </Providers>
  </BrowserRouter>
);

export default App;
