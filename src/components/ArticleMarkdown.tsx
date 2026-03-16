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
  table: ({ children }) => (
    <div className="my-6 w-full overflow-x-auto">
      <table className="w-full table-auto border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="break-words border px-3 py-2 text-left">{children}</th>,
  td: ({ children }) => <td className="break-words border px-3 py-2 align-top">{children}</td>,
  code({ className, children, ...props }) {
    // Fenced code block: has a className like "language-python"
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code
          className="whitespace-pre-wrap break-all rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-800 dark:bg-stone-800 dark:text-stone-200"
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

    const className =
      "text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent break-words [overflow-wrap:anywhere]";

    if (!isExternal) {
      return (
        <a href={href} className={className} {...props}>
          {children as ReactNode}
        </a>
      );
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>
        {children as ReactNode}{" "}
        <ExternalLinkIcon size={12} className="inline-block align-text-top" />
      </a>
    );
  },
};
