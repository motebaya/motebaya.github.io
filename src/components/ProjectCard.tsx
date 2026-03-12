import { motion } from "framer-motion";
import { Star, GitFork, ExternalLink } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { GitHubRepo } from "@/types/github";

const LANGUAGE_COLORS: Record<string, string> = {
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  PHP: "#4F5D95",
  Ruby: "#701516",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Go: "#00ADD8",
};

interface ProjectCardProps {
  repo: GitHubRepo;
  index: number;
}

export default function ProjectCard({ repo, index }: ProjectCardProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.a
      href={repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      initial={prefersReduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.35, delay: index * 0.06 }}
      whileHover={prefersReduced ? {} : { scale: 1.02 }}
      className="group block rounded-xl border border-stone-200 bg-surface-card-light p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:border-stone-700 dark:bg-surface-card-dark"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-heading text-base text-stone-800 transition-colors group-hover:text-accent dark:text-stone-100">
          {repo.name}
        </h3>
        <ExternalLink
          size={14}
          className="mt-0.5 shrink-0 text-stone-400 transition-colors group-hover:text-accent"
        />
      </div>

      {repo.description && (
        <p className="mb-3 line-clamp-2 text-sm text-stone-500 dark:text-stone-400">
          {repo.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
        {repo.language && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: LANGUAGE_COLORS[repo.language] ?? "#8b8b8b" }}
            />
            {repo.language}
          </span>
        )}
        {repo.stargazers_count > 0 && (
          <span className="flex items-center gap-1">
            <Star size={12} />
            {repo.stargazers_count}
          </span>
        )}
        {repo.forks_count > 0 && (
          <span className="flex items-center gap-1">
            <GitFork size={12} />
            {repo.forks_count}
          </span>
        )}
      </div>

      {repo.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {repo.topics.slice(0, 5).map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent dark:bg-accent/20"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </motion.a>
  );
}
