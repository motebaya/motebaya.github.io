import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeContext } from "@/context/ThemeContext";
import { useTheme } from "@/hooks/useTheme";
import { useLenis } from "@/hooks/useLenis";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Grid from "@/components/layout/Grid";
import ProfileCard from "@/components/ProfileCard";
import CertificateCard from "@/components/CertificateCard";
import SkillsSection from "@/components/SkillsSection";
import BackToTop from "@/components/BackToTop";
import Skeleton from "@/components/ui/Skeleton";

const ProjectList = lazy(() => import("@/components/ProjectList"));
const BlogList = lazy(() => import("@/components/BlogList"));
const Live2DWidget = lazy(() => import("@/components/Live2DWidget"));
const BlogsPage = lazy(() => import("@/pages/BlogsPage"));
const BlogArticlePage = lazy(() => import("@/pages/BlogArticlePage"));

function ProjectListFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function BlogListFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

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

function HomeContent() {
  return (
    <>
      <Grid
        left={
          <>
            <ProfileCard />
            <CertificateCard />
          </>
        }
        right={
          <>
            <SkillsSection />
            <Suspense fallback={<ProjectListFallback />}>
              <ProjectList />
            </Suspense>
            <Suspense fallback={<BlogListFallback />}>
              <BlogList />
            </Suspense>
          </>
        }
      />
      <BackToTop />
      <Suspense fallback={null}>
        <Live2DWidget />
      </Suspense>
    </>
  );
}

export default function App() {
  const themeState = useTheme();
  useLenis();

  return (
    <ThemeContext.Provider value={themeState}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomeContent />} />
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
          </Routes>
        </main>
        <Footer />
      </div>
    </ThemeContext.Provider>
  );
}
