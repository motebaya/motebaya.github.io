import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeContext } from "@/context/ThemeContext";
import { useTheme } from "@/hooks/useTheme";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import NotFoundPage from "@/pages/NotFoundPage";
import Skeleton from "@/components/ui/Skeleton";

const HomePage = lazy(() => import("@/pages/HomePage"));
const BlogsPage = lazy(() => import("@/pages/BlogsPage"));
const BlogArticlePage = lazy(() => import("@/pages/BlogArticlePage"));

function PageFallback() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export default function App() {
  const themeState = useTheme();

  return (
    <ThemeContext.Provider value={themeState}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={<PageFallback />}>
                  <HomePage />
                </Suspense>
              }
            />
            <Route
              path="/blogs"
              element={
                <Suspense fallback={<PageFallback />}>
                  <BlogsPage />
                </Suspense>
              }
            />
            <Route
              path="/blogs/:slug"
              element={
                <Suspense fallback={<PageFallback />}>
                  <BlogArticlePage />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </ThemeContext.Provider>
  );
}
