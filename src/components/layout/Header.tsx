import ThemeToggle from "@/components/ThemeToggle";
import { useThemeContext } from "@/context/ThemeContext";

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

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-surface-light/80 backdrop-blur-md transition-colors dark:border-stone-800 dark:bg-surface-dark/80">
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
