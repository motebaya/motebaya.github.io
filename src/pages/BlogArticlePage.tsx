import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Skeleton from "@/components/ui/Skeleton";
import { articleComponents } from "@/components/ArticleMarkdown";
import { formatRelativeDate, formatAbsoluteDate, estimateReadingTime } from "@/lib/blog";
import type { BlogPost } from "@/types/content";
import blogsData from "@content/blogs.json";

const allPosts = blogsData as BlogPost[];

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const post = allPosts.find((p) => p.blogUrl.replace(/\.md$/, "") === slug);

  useEffect(() => {
    if (!post) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMarkdown() {
      const modules = import.meta.glob("/content/blog/*.md", {
        query: "?raw",
        import: "default",
      }) as Record<string, () => Promise<string>>;

      const key = `/content/blog/${post!.blogUrl}`;
      const loader = modules[key];

      if (!loader) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      try {
        const md = await loader();
        if (!cancelled) {
          setMarkdown(md);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    loadMarkdown();
    return () => {
      cancelled = true;
    };
  }, [post]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  // Reading progress bar — direct DOM mutation, no React re-renders
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return;

    // Position bar directly below the sticky header
    const header = document.querySelector("header");
    if (header) {
      bar.style.top = `${header.getBoundingClientRect().height}px`;
    }

    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      bar.style.width = `${progress * 100}%`;
    };

    const onResize = () => {
      if (header) {
        bar.style.top = `${header.getBoundingClientRect().height}px`;
      }
      updateProgress();
    };

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", onResize);
    updateProgress();

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", onResize);
    };
  }, [loading]);

  if (notFound || !post) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center px-4 py-24">
        <h1 className="mb-2 font-heading text-2xl text-stone-800 dark:text-stone-100">
          Article not found
        </h1>
        <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
          The article you're looking for doesn't exist.
        </p>
        <Link
          to="/blogs"
          className="text-sm text-accent underline-offset-4 transition-colors hover:underline"
        >
          Back to all posts
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Reading progress bar */}
      <div ref={progressRef} className="fixed left-0 z-50 h-[3px] w-0 bg-blue-500" />

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Back button */}
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : (
          <>
            {/* Title */}
            <h1 className="mb-4 font-heading text-2xl text-stone-800 dark:text-stone-100 sm:text-3xl">
              {post.title}
            </h1>

            {/* Meta row */}
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400 dark:text-stone-500">
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {formatRelativeDate(post.publishDate)}
                <span className="text-stone-300 dark:text-stone-600">
                  ({formatAbsoluteDate(post.publishDate)})
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {estimateReadingTime(markdown)}
              </span>
              <span className="flex items-center gap-1">
                <User size={12} />
                by {post.author}
              </span>
            </div>

            {/* Tags */}
            <div className="mb-5 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent dark:bg-accent/20"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Thumbnail */}
            <img
              src={`/images/blog/${post.thumbnail}`}
              alt={post.title}
              width={800}
              height={400}
              className="mb-8 w-full rounded-xl object-cover shadow-sm"
            />

            {/* Article content */}
            <article className="prose prose-stone max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={articleComponents}>
                {markdown ?? ""}
              </ReactMarkdown>
            </article>

            {/* Footer */}
            <div className="mt-12 border-t border-stone-200 pt-6 text-center dark:border-stone-700">
              <Link
                to="/blogs"
                className="text-sm text-accent underline-offset-4 transition-colors hover:underline"
              >
                View all posts
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
