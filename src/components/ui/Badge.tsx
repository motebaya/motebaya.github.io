interface BadgeProps {
  icon?: string;
  label: string;
  className?: string;
}

export default function Badge({ icon, label, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 transition-colors dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 ${className}`}
    >
      {icon && <img src={icon} alt="" className="h-4 w-4" loading="lazy" width={16} height={16} />}
      {label}
    </span>
  );
}
