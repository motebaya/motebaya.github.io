import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Skeleton from "@/components/ui/Skeleton";
import BlogCard from "@/components/BlogCard";
import type { BlogPost } from "@/types/content";
import blogsData from "@content/blogs.json";

const allPosts = blogsData as BlogPost[];

/** Highlighted posts, sorted newest-first, limited to 4 */
const highlightedPosts = allPosts
  .filter((p) => p.highlight)
  .sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())
  .slice(0, 4);

export default function BlogList() {
  const [markdownMap, setMarkdownMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const modules = import.meta.glob("/content/blog/*.md", {
        query: "?raw",
        import: "default",
      }) as Record<string, () => Promise<string>>;

      const entries: [string, string][] = [];

      for (const post of highlightedPosts) {
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

  return (
    <Card animate={false}>
      <div className="flex items-start justify-between" data-live2d-hover="article">
        <SectionTitle icon={BookOpen}>Blog</SectionTitle>
        <Link
          to="/blogs"
          aria-label="View all blog posts"
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <ArrowRight size={14} />
        </Link>
      </div>
      <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
        Highlighted articles and dev notes
      </p>

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
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
          {highlightedPosts.map((post, i) => (
            <BlogCard
              key={post.blogUrl}
              post={post}
              index={i}
              markdown={markdownMap[post.blogUrl] ?? null}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
