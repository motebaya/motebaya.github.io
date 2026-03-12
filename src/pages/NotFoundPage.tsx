import { Link, useLocation } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-heading text-7xl font-bold text-accent sm:text-8xl">404</h1>
      <h2 className="mt-4 font-heading text-xl text-stone-800 dark:text-stone-100 sm:text-2xl">
        Page not found
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        The path{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          {location.pathname}
        </code>{" "}
        doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Home size={16} />
          Go Home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <ArrowLeft size={16} />
          Go Back
        </button>
      </div>
    </div>
  );
}
