import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface CardProps {
  children: ReactNode;
  className?: string;
  animate?: boolean;
}

export default function Card({ children, className = "", animate = true }: CardProps) {
  const prefersReduced = useReducedMotion();
  const shouldAnimate = animate && !prefersReduced;

  const content = (
    <div
      className={`rounded-2xl border border-stone-200 bg-surface-card-light p-6 shadow-sm transition-colors dark:border-stone-800 dark:bg-surface-card-dark ${className}`}
    >
      {children}
    </div>
  );

  if (!shouldAnimate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
}
