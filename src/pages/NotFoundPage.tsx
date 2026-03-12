import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-[70vh] flex-col items-start justify-center px-6 py-24 font-sans md:px-12">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-6xl">
          Error 404
        </h1>

        <p className="mt-6 text-lg text-stone-600 dark:text-stone-400">
          We couldn't find a route matching <code className="bg-stone-100 px-1 py-0.5 font-mono text-sm dark:bg-stone-800 dark:text-stone-300">{location.pathname}</code>.
        </p>

        <p className="mt-2 text-base text-stone-500 dark:text-stone-500">
          The page might have been removed, had its name changed, or is temporarily unavailable.
        </p>

        <div className="mt-12">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 border-b-2 border-transparent pb-1 text-sm font-semibold text-stone-900 transition-all hover:border-stone-900 dark:text-stone-100 dark:hover:border-stone-100"
          >
            <ArrowLeft
              size={18}
              className="transition-transform duration-300 group-hover:-translate-x-1"
            />
            Return to application
          </Link>
        </div>
      </div>
    </div>
  );
}