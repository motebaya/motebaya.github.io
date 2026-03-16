import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpDown, BookOpen } from "lucide-react";
import { Helmet } from "react-helmet-async";
import BlogCard from "@/components/BlogCard";
import Skeleton from "@/components/ui/Skeleton";
import type { BlogPost } from "@/types/content";
import blogsData from "@content/blogs.json";

const allPosts = blogsData as BlogPost[];

export default function BlogsPage() {
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [markdownMap, setMarkdownMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const modules = import.meta.glob("/content/blog/*.md", {
        query: "?raw",
        import: "default",
      }) as Record<string, () => Promise<string>>;

      const entries: [string, string][] = [];

      for (const post of allPosts) {
        const key = `/content/blog/${post.blogUrl}`;
        const loader = modules[key];
        if (loader) {
          try {
            const md = await loader();
            entries.push([post.blogUrl, md]);
          } catch {
            // skip
          }
        }
      }

      if (!cancelled) {
        setMarkdownMap(Object.fromEntries(entries));
        setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = [...allPosts].sort((a, b) => {
    const diff = new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
    return sortOrder === "desc" ? -diff : diff;
  });

  return (
    <>
      <Helmet>
        <title>All Blog Posts | Portofolio - Motebaya</title>
        <meta
          name="description"
          content="Technical blog articles, deep dives, and dev notes on Python, JavaScript, Ruby, automation, and reverse engineering."
        />
        <link rel="canonical" href="https://motebaya.github.io/blogs" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Portofolio - Motebaya" />
        <meta property="og:title" content="All Blog Posts | Portofolio - Motebaya" />
        <meta
          property="og:description"
          content="Technical blog articles, deep dives, and dev notes on Python, JavaScript, Ruby, automation, and reverse engineering."
        />
        <meta property="og:url" content="https://motebaya.github.io/blogs" />
        <meta property="og:image" content="https://motebaya.github.io/cover.webp" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="All Blog Posts | Portofolio - Motebaya" />
        <meta
          name="twitter:description"
          content="Technical blog articles, deep dives, and dev notes on Python, JavaScript, Ruby, automation, and reverse engineering."
        />
        <meta name="twitter:image" content="https://motebaya.github.io/cover.webp" />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <button
            onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            aria-label={`Sort by date ${sortOrder === "desc" ? "ascending" : "descending"}`}
          >
            <ArrowUpDown size={16} />
            {sortOrder === "desc" ? "Newest first" : "Oldest first"}
          </button>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="flex items-center gap-2 font-heading text-2xl text-stone-800 dark:text-stone-100">
            <BookOpen size={24} className="text-accent" />
            All Blog Posts
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {allPosts.length} {allPosts.length === 1 ? "article" : "articles"} published
          </p>
        </div>

        {/* List */}
        {loading && (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
                <div className="flex gap-4">
                  <Skeleton className="hidden h-20 w-40 shrink-0 sm:block" />
                  <div className="flex-1">
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="mb-2 h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-4">
            {sorted.map((post, i) => (
              <BlogCard
                key={post.blogUrl}
                post={post}
                index={i}
                markdown={markdownMap[post.blogUrl] ?? null}
              />
            ))}
          </div>
        )}

        {/* Footer link */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-sm text-accent underline-offset-4 transition-colors hover:underline"
          >
            Back to portfolio
          </Link>
        </div>
      </div>
    </>
  );
}
