import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRepos } from "@/lib/github";

function mockRepo(overrides = {}) {
  return {
    name: "test-repo",
    description: "A test repo",
    html_url: "https://github.com/motebaya/test-repo",
    language: "Python",
    stargazers_count: 5,
    forks_count: 2,
    updated_at: "2026-02-09T11:58:29Z",
    topics: ["python", "automation"],
    ...overrides,
  };
}

describe("github.ts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches, sorts by updated_at descending, and limits to 8", async () => {
    const repos = Array.from({ length: 12 }, (_, i) =>
      mockRepo({
        name: `repo-${i}`,
        updated_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(repos), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchRepos();
    expect(result).toHaveLength(8);
    // First result should be the most recently updated
    expect(result[0]!.name).toBe("repo-11");
    expect(result[7]!.name).toBe("repo-4");
  });

  it("throws rate_limit error on 403 with X-RateLimit-Remaining: 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", {
        status: 403,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "1709900000",
        },
      }),
    );

    try {
      await fetchRepos();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const error = err as { type: string; resetAt: number | null };
      expect(error.type).toBe("rate_limit");
      expect(error.resetAt).toBe(1709900000 * 1000);
    }
  });

  it("throws invalid error on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("server error", { status: 500 }),
    );

    try {
      await fetchRepos();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const error = err as { type: string; message: string };
      expect(error.type).toBe("invalid");
      expect(error.message).toBe("HTTP 500");
    }
  });

  it("throws empty error when response is empty array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      await fetchRepos();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const error = err as { type: string };
      expect(error.type).toBe("empty");
    }
  });

  it("throws invalid error on malformed response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ not: "an array" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      await fetchRepos();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const error = err as { type: string };
      expect(error.type).toBe("invalid");
    }
  });

  it("throws network error on fetch TypeError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );

    try {
      await fetchRepos();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TypeError);
    }
  });
});
