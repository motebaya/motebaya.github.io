import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import CodeBlock from "@/components/CodeBlock";

/**
 * Custom react-markdown component overrides for article pages.
 * - Code blocks: syntax highlighting, line numbers, copy button
 * - Links: external icon for http(s) links, styled with accent color
 */
export const articleComponents: Components = {
  code({ className, children, ...props }) {
    // Fenced code block: has a className like "language-python"
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code
          className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-800 dark:bg-stone-800 dark:text-stone-200"
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, "")}</CodeBlock>;
  },

  pre({ children }) {
    // Let the <code> handler above handle everything —
    // just pass children through without the default <pre> wrapper.
    return <>{children}</>;
  },

  a({ href, children, ...props }) {
    const isExternal = href?.startsWith("http");

    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent"
          {...props}
        >
          {children as ReactNode}
          <ExternalLinkIcon size={12} className="shrink-0" />
        </a>
      );
    }

    return (
      <a
        href={href}
        className="text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent"
        {...props}
      >
        {children as ReactNode}
      </a>
    );
  },
};
