import { useState, useEffect, useRef } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeContext } from "@/context/ThemeContext";

/** Minimum downward scroll (px) before hiding. Upward scroll shows immediately. */
const HIDE_DELTA = 10;

function Logo() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-8 w-8 lg:h-10 lg:w-10"
      aria-label="Motebaya logo"
      role="img"
      fill="currentColor"
    >
      <path d="M8 52V12h10l14 22 14-22h10v40h-10V28L32 48 18 28v24z" />
    </svg>
  );
}

export default function Header() {
  const { theme } = useThemeContext();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    // Tracks the scroll position where the current direction started.
    // Reset every time the direction reverses so the threshold
    // accumulates only for continuous movement in one direction.
    const anchor = { y: 0, direction: 0 }; // direction: -1 up, 0 idle, 1 down

    const handleScroll = () => {
      const currentY = window.scrollY;

      // Only auto-hide on mobile (below md breakpoint)
      if (window.innerWidth >= 768) {
        setHidden(false);
        lastScrollY.current = currentY;
        anchor.y = currentY;
        anchor.direction = 0;
        return;
      }

      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (delta === 0) return;

      const dir = delta > 0 ? 1 : -1;

      // Direction changed — reset anchor to current position
      if (dir !== anchor.direction) {
        anchor.y = currentY;
        anchor.direction = dir;
      }

      if (dir < 0) {
        // Scrolling UP — show header immediately, no threshold
        setHidden(false);
      } else if (currentY - anchor.y > HIDE_DELTA && currentY > 60) {
        // Scrolling DOWN — only hide after accumulating HIDE_DELTA px
        setHidden(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      data-header-hidden={hidden}
      className={`sticky top-0 z-40 border-b border-stone-200 bg-surface-light/80 backdrop-blur-md transition duration-300 dark:border-stone-800 dark:bg-surface-dark/80 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <a
          href="/"
          className="flex items-center gap-3 text-stone-800 transition-colors hover:text-accent dark:text-stone-200"
          aria-label="Home"
        >
          <Logo />
          <img
            src={theme === "dark" ? "/logo-light.png" : "/logo-dark.png"}
            alt="Motebaya"
            className="hidden h-7 w-auto md:block lg:h-8"
          />
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
