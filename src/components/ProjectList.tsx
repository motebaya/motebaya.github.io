import { Layers, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Skeleton from "@/components/ui/Skeleton";
import ErrorFallback from "@/components/ui/ErrorFallback";
import ProjectCard from "@/components/ProjectCard";
import { useGitHubRepos } from "@/hooks/useGitHubRepos";
import { useInView } from "@/hooks/useInView";
import type { GitHubError } from "@/lib/github";

function getErrorMessage(error: GitHubError): string {
  switch (error.type) {
    case "rate_limit": {
      if (error.resetAt) {
        const date = new Date(error.resetAt);
        return `GitHub API rate limit reached. Resets at ${date.toLocaleTimeString()}.`;
      }
      return "GitHub API rate limit reached. Please try again later.";
    }
    case "network":
      return "Unable to connect. Check your network and try again.";
    case "empty":
      return "No repositories found.";
    case "invalid":
      return "Something went wrong loading projects.";
  }
}

function ProjectSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"
        >
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="mt-3 flex gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectList() {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: "200px" });
  const { data, isLoading, error, retry, forceRefresh } = useGitHubRepos(inView);

  return (
    <Card animate={false}>
      <div ref={ref}>
        <div className="flex items-start justify-between" data-live2d-hover="projects">
          <SectionTitle icon={Layers}>Projects</SectionTitle>
          <button
            onClick={forceRefresh}
            disabled={isLoading}
            aria-label="Refresh project list"
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Recently updated public repositories
        </p>

        {isLoading && <ProjectSkeleton />}

        {error && error.type !== "empty" && (
          <ErrorFallback message={getErrorMessage(error)} onRetry={retry} />
        )}

        {error && error.type === "empty" && (
          <p className="py-6 text-center text-sm text-stone-500 dark:text-stone-400">
            {getErrorMessage(error)}
          </p>
        )}

        {data && (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((repo, i) => (
              <ProjectCard key={repo.name} repo={repo} index={i} />
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-stone-400 dark:text-stone-500">
          Fetched from the GitHub API (cached for 1 hour)
        </p>
      </div>
    </Card>
  );
}
