import { GITHUB_REPOS_API, GITHUB_USERNAME } from "./constants";
import type { GitHubRepo } from "@/types/github";

export type GitHubError =
  | { type: "rate_limit"; resetAt: number | null }
  | { type: "network"; message: string }
  | { type: "empty" }
  | { type: "invalid"; message: string };

/** Repos to exclude from the project list (not actual projects) */
const EXCLUDED_REPOS = [GITHUB_USERNAME];

function isGitHubRepoArray(data: unknown): data is GitHubRepo[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true;
  const first = data[0];
  return (
    typeof first === "object" &&
    first !== null &&
    "name" in first &&
    "html_url" in first &&
    "updated_at" in first
  );
}

export async function fetchRepos(signal?: AbortSignal): Promise<GitHubRepo[]> {
  const res = await fetch(GITHUB_REPOS_API, {
    signal,
    headers: { Accept: "application/vnd.github.v3+json" },
  });

  if (res.status === 403) {
    const remaining = res.headers.get("X-RateLimit-Remaining");
    if (remaining === "0") {
      const resetHeader = res.headers.get("X-RateLimit-Reset");
      const resetAt = resetHeader ? Number(resetHeader) * 1000 : null;
      const err: GitHubError = { type: "rate_limit", resetAt };
      throw err;
    }
  }

  if (!res.ok) {
    const err: GitHubError = { type: "invalid", message: `HTTP ${res.status}` };
    throw err;
  }

  const json: unknown = await res.json();

  if (!isGitHubRepoArray(json)) {
    const err: GitHubError = { type: "invalid", message: "Unexpected response shape" };
    throw err;
  }

  if (json.length === 0) {
    const err: GitHubError = { type: "empty" };
    throw err;
  }

  // Filter out excluded repos, sort by updated_at descending, take first 8
  const filtered = json.filter(
    (repo) => !EXCLUDED_REPOS.includes(repo.name.toLowerCase()),
  );

  if (filtered.length === 0) {
    const err: GitHubError = { type: "empty" };
    throw err;
  }

  return filtered
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);
}
