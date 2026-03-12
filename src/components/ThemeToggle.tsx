import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useThemeContext } from "@/context/ThemeContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeContext();
  const prefersReduced = useReducedMotion();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-live2d-hover="theme"
      className="flex items-center justify-center rounded-full p-2 text-stone-700 transition-colors hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={prefersReduced ? false : { rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={prefersReduced ? undefined : { rotate: 90, scale: 0, opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
          >
            <Sun size={20} />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={prefersReduced ? false : { rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={prefersReduced ? undefined : { rotate: -90, scale: 0, opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
          >
            <Moon size={20} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
