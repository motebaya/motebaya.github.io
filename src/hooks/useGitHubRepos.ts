import { useState, useEffect, useCallback, useRef } from "react";
import { fetchRepos, type GitHubError } from "@/lib/github";
import type { GitHubRepo } from "@/types/github";

const CACHE_KEY = "github-repos-cache";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

interface CacheEntry {
  repos: GitHubRepo[];
  timestamp: number;
}

function readCache(): GitHubRepo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.repos;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function writeCache(repos: GitHubRepo[]): void {
  try {
    const entry: CacheEntry = { repos, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable -- ignore
  }
}

interface UseGitHubReposResult {
  data: GitHubRepo[] | null;
  isLoading: boolean;
  error: GitHubError | null;
  retry: () => void;
  forceRefresh: () => void;
}

export function useGitHubRepos(enabled: boolean): UseGitHubReposResult {
  const [data, setData] = useState<GitHubRepo[] | null>(() => readCache());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitHubError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRetryRef = useRef(0);

  const doFetch = useCallback(() => {
    // Debounce retries (min 2s between attempts)
    const now = Date.now();
    if (now - lastRetryRef.current < 2000) return;
    lastRetryRef.current = now;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 10-second timeout
    const timeout = setTimeout(() => controller.abort(), 10000);

    setIsLoading(true);
    setError(null);

    fetchRepos(controller.signal)
      .then((repos) => {
        setData(repos);
        setError(null);
        writeCache(repos);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        if (
          typeof err === "object" &&
          err !== null &&
          "type" in err &&
          typeof (err as GitHubError).type === "string"
        ) {
          setError(err as GitHubError);
        } else if (err instanceof TypeError) {
          setError({ type: "network", message: err.message });
        } else if (err instanceof DOMException && err.name === "AbortError") {
          setError({ type: "network", message: "Request timed out" });
        } else {
          setError({ type: "invalid", message: String(err) });
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!enabled || data) return;
    doFetch();
    return () => abortRef.current?.abort();
  }, [enabled, data, doFetch]);

  const retry = useCallback(() => {
    setData(null);
    doFetch();
  }, [doFetch]);

  /** Bypass cache and fetch fresh data from the API */
  const forceRefresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setData(null);
    setError(null);
    // Reset debounce so force refresh always works
    lastRetryRef.current = 0;
    doFetch();
  }, [doFetch]);

  return { data, isLoading, error, retry, forceRefresh };
}
