import { useEffect, useRef, useState, useCallback } from "react";
import hljs from "highlight.js/lib/core";
import { Check, Copy } from "lucide-react";

// Register only the languages we use to keep the bundle small
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import kotlin from "highlight.js/lib/languages/kotlin";
import dart from "highlight.js/lib/languages/dart";

hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("dart", dart);

interface CodeBlockProps {
  language?: string;
  children: string;
}

export default function CodeBlock({ language, children }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const code = children.replace(/\n$/, "");
  const lines = code.split("\n");
  const gutterWidth = String(lines.length).length;

  useEffect(() => {
    if (!codeRef.current) return;
    if (language && hljs.getLanguage(language)) {
      codeRef.current.innerHTML = hljs.highlight(code, { language }).value;
    } else {
      codeRef.current.innerHTML = hljs.highlightAuto(code).value;
    }
  }, [code, language]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="not-prose group my-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-950 dark:border-stone-700">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code with line numbers */}
      <div className="overflow-x-auto">
        <div className="flex min-w-fit">
          {/* Line number gutter */}
          <div
            className="shrink-0 select-none border-r border-stone-800 py-3 pr-3 text-right font-mono text-[13px] leading-6 text-stone-600"
            style={{ paddingLeft: "12px", minWidth: `${gutterWidth + 2}ch` }}
            aria-hidden="true"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Highlighted code */}
          <pre className="flex-1 py-3">
            <code
              ref={codeRef}
              className={`block px-4 font-mono text-[13px] leading-6 text-stone-200 ${language ? `language-${language}` : ""}`}
            >
              {code}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
