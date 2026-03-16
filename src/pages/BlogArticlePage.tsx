import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Skeleton from "@/components/ui/Skeleton";
import BackToTop from "@/components/BackToTop";
import { articleComponents } from "@/components/ArticleMarkdown";
import { formatRelativeDate, formatAbsoluteDate, estimateReadingTime } from "@/lib/blog";
import type { BlogPost } from "@/types/content";
import blogsData from "@content/blogs.json";
import { Helmet } from "react-helmet-async";

const allPosts = blogsData as BlogPost[];

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const post = allPosts.find((p) => p.blogUrl.replace(/\.md$/, "") === slug);
  const siteName = "Portofolio - Motebaya";
  const baseUrl = "https://motebaya.github.io";
  const canonicalUrl = post
    ? `${baseUrl}/blogs/${post.blogUrl.replace(/\.md$/, "")}`
    : `${baseUrl}/blogs`;
  const ogImageUrl = post
    ? `${baseUrl}/images/blog/${post.thumbnail}`
    : `${baseUrl}/images/og-default.webp`;

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

    const header = document.querySelector("header");
    let headerHeight = header ? header.getBoundingClientRect().height : 0;

    const updateBarPosition = () => {
      if (!header) return;
      const isHidden = header.getAttribute("data-header-hidden") === "true";
      if (isHidden) {
        // Header is hidden (translated up) — stick bar to top of viewport
        bar.style.top = "0px";
      } else {
        bar.style.top = `${headerHeight}px`;
      }
    };

    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      // Use scaleX transform instead of width to avoid triggering layout / overflow
      bar.style.transform = `scaleX(${progress})`;
      updateBarPosition();
    };

    const onResize = () => {
      if (header) {
        headerHeight = header.getBoundingClientRect().height;
      }
      updateProgress();
    };

    // Watch for header visibility changes via data-header-hidden attribute.
    // React's state update is async — when the header re-renders with a new
    // data-header-hidden value, the scroll handler may have already fired
    // with the stale attribute. The MutationObserver fires synchronously
    // after React commits, so the bar repositions without waiting for
    // the next scroll event.
    let observer: MutationObserver | null = null;
    if (header) {
      observer = new MutationObserver(() => {
        updateBarPosition();
      });
      observer.observe(header, {
        attributes: true,
        attributeFilter: ["data-header-hidden"],
      });
    }

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", onResize);
    updateProgress();

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
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
      {/* SEO meta tags */}
      <Helmet>
        <title>{post ? `${post.title} | ${siteName}` : `Blogs | ${siteName}`}</title>

        <meta
          name="description"
          content={post?.description ?? "Technical blog articles and deep dives."}
        />

        <meta name="author" content={post?.author ?? "motebaya"} />
        <meta name="keywords" content={post?.tags?.join(", ") ?? "blog, programming, tech"} />

        <link rel="canonical" href={canonicalUrl} />

        <meta property="og:type" content="article" />
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={post?.title ?? "Blogs"} />
        <meta
          property="og:description"
          content={post?.description ?? "Technical blog articles and deep dives."}
        />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />

        <meta property="article:published_time" content={post?.publishDate ?? ""} />
        <meta property="article:author" content={post?.author ?? "motebaya"} />
        {post?.tags?.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post?.title ?? "Blogs"} />
        <meta
          name="twitter:description"
          content={post?.description ?? "Technical blog articles and deep dives."}
        />
        <meta name="twitter:image" content={ogImageUrl} />
      </Helmet>

      {/* Reading progress bar — uses scaleX + inset-x to avoid horizontal overflow */}
      <div
        ref={progressRef}
        className="fixed inset-x-0 z-50 h-[3px] max-w-[100vw] origin-left bg-blue-500 transition-[top] duration-300"
        style={{ transform: "scaleX(0)" }}
      />

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

      <BackToTop />
    </>
  );
}
