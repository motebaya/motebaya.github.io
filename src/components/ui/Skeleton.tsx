interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-stone-200 dark:bg-stone-700 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
