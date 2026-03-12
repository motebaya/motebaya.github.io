import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, Clock, User } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatRelativeDate, formatAbsoluteDate, estimateReadingTime, blogSlug } from "@/lib/blog";
import type { BlogPost } from "@/types/content";

interface BlogCardProps {
  post: BlogPost;
  index: number;
  markdown: string | null;
}

export default function BlogCard({ post, index, markdown }: BlogCardProps) {
  const prefersReduced = useReducedMotion();
  const slug = blogSlug(post.blogUrl);

  return (
    <motion.article
      initial={prefersReduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.35, delay: index * 0.08 }}
      className="overflow-hidden rounded-xl border border-stone-200 bg-surface-card-light p-4 shadow-sm transition-shadow hover:shadow-md dark:border-stone-700 dark:bg-surface-card-dark article-card"
      data-live2d-hover="article-card"
    >
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <img
          src={`/images/blog/${post.thumbnail}`}
          alt={post.title}
          width={160}
          height={80}
          loading="lazy"
          className="hidden h-20 w-40 shrink-0 rounded-lg object-cover sm:block"
        />

        {/* Metadata */}
        <div className="min-w-0 flex-1">
          <Link
            to={`/blogs/${slug}`}
            className="font-heading text-base text-stone-800 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:text-stone-100 dark:hover:text-accent sm:text-lg"
          >
            {post.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-stone-500 dark:text-stone-400">
            {post.description}
          </p>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400 dark:text-stone-500">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              <span title={formatAbsoluteDate(post.publishDate)}>
                {formatRelativeDate(post.publishDate)}
              </span>
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


        </div>
      </div>
    </motion.article>
  );
}
