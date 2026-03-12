import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SectionTitleProps {
  icon: LucideIcon;
  children: ReactNode;
}

export default function SectionTitle({ icon: Icon, children }: SectionTitleProps) {
  return (
    <h2 className="mb-4 flex items-center gap-2 font-heading text-xl text-stone-800 dark:text-stone-100">
      <Icon size={20} className="text-accent" />
      {children}
    </h2>
  );
}
