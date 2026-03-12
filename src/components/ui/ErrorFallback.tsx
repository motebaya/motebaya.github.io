interface ErrorFallbackProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorFallback({ message, onRetry }: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-6 py-8 text-center dark:border-stone-700 dark:bg-stone-800/50">
      <p className="text-sm text-stone-600 dark:text-stone-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm text-white transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
