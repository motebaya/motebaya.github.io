import { lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import Grid from "@/components/layout/Grid";
import ProfileCard from "@/components/ProfileCard";
import CertificateCard from "@/components/CertificateCard";
import SkillsSection from "@/components/SkillsSection";
import BackToTop from "@/components/BackToTop";
import Skeleton from "@/components/ui/Skeleton";
import { useLenis } from "@/hooks/useLenis";

const ProjectList = lazy(() => import("@/components/ProjectList"));
const BlogList = lazy(() => import("@/components/BlogList"));
const Live2DWidget = lazy(() => import("@/components/Live2DWidget"));

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

export default function HomePage() {
  // Smooth scroll only on the home page – blog pages don't need it
  useLenis();

  return (
    <>
      <Helmet>
        <title>Motebaya - Portfolio</title>
        <meta
          name="description"
          content="Portfolio of Motebaya - developer experienced in Python, JavaScript, PHP, and Ruby. Web scraping, automation, and full-stack projects."
        />
        <link rel="canonical" href="https://motebaya.github.io/" />

        <meta property="og:type" content="website" />
        <meta property="og:title" content="Motebaya - Portfolio" />
        <meta
          property="og:description"
          content="Developer portfolio showcasing projects, skills, and experience."
        />
        <meta property="og:url" content="https://motebaya.github.io/" />
        <meta property="og:image" content="https://motebaya.github.io/cover.webp" />
        <meta property="og:image:width" content="1280" />
        <meta property="og:image:height" content="720" />
        <meta property="og:locale" content="en_US" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Motebaya - Portfolio" />
        <meta
          name="twitter:description"
          content="Developer portfolio showcasing projects, skills, and experience."
        />
        <meta name="twitter:image" content="https://motebaya.github.io/cover.webp" />

        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Motebaya",
            alternateName: "davins",
            url: "https://motebaya.github.io",
            sameAs: [
              "https://github.com/motebaya",
              "https://t.me/dvinchii",
              "https://x.com/vinds71",
              "https://www.youtube.com/@ItsMochino",
            ],
            knowsAbout: ["Python", "JavaScript", "PHP", "Ruby", "Web Scraping", "Automation"],
          })}
        </script>
      </Helmet>

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
