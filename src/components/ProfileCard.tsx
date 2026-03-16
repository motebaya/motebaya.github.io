import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Send, Twitter, Youtube } from "lucide-react";
import Card from "@/components/ui/Card";
import SocialButton from "@/components/ui/SocialButton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { GITHUB_AVATAR_URL, SOCIAL_LINKS } from "@/lib/constants";
import profileMd from "@content/profile.md?raw";

const ICON_MAP: Record<string, typeof Github> = {
  GitHub: Github,
  Telegram: Send,
  X: Twitter,
  YouTube: Youtube,
};

// Split at the first blank-line boundary so paragraph 1-2 are the preview
const PREVIEW_CUTOFF = 2;

function splitMarkdown(md: string): [string, string] {
  // Normalise CRLF → LF so the blank-line split works on every OS
  const normalised = md.replace(/\r\n/g, "\n");
  const paragraphs = normalised.trim().split(/\n\n+/);
  const preview = paragraphs.slice(0, PREVIEW_CUTOFF).join("\n\n");
  const rest = paragraphs.slice(PREVIEW_CUTOFF).join("\n\n");
  return [preview, rest];
}

export default function ProfileCard() {
  const [expanded, setExpanded] = useState(false);
  const prefersReduced = useReducedMotion();
  const [preview, rest] = splitMarkdown(profileMd);

  return (
    <Card className="overflow-hidden p-0">
      {/* Cover */}
      <div className="-mx-3 -mt-3 mb-4">
        <picture data-live2d-hover="cover">
          <source
            type="image/webp"
            srcSet="/images/covers/cover-640w.webp 640w, /images/covers/cover-960w.webp 960w, /images/covers/cover-1280w.webp 1280w"
            sizes="(max-width: 640px) 640px, (max-width: 960px) 960px, 1280px"
          />
          <img
            src="/images/covers/cover.jpeg"
            alt="Cover"
            width={1280}
            height={720}
            loading="eager"
            className="h-40 w-full rounded-xl border-b border-white/80 object-cover shadow-sm dark:border-stone-700/60 sm:h-52"
          />
        </picture>
      </div>

      <div className="relative px-1 pb-4">
        {/* Avatar */}
        <div className="-mt-14 mb-3">
          <img
            src={GITHUB_AVATAR_URL}
            alt="Motebaya avatar"
            width={112}
            height={112}
            loading="eager"
            data-live2d-hover="avatar"
            className="h-28 w-28 rounded-full border-4 border-surface-card-light object-cover shadow-lg dark:border-surface-card-dark"
          />
        </div>

        {/* Name */}
        <h1 className="mb-3 font-heading text-2xl text-stone-800 dark:text-stone-100">Motebaya</h1>

        {/* Bio */}
        <section aria-label="About me" data-live2d-hover="about">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            About me
          </h2>

          <div className="prose prose-sm prose-stone max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="extended"
                  initial={prefersReduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.35 }}
                  className="overflow-hidden"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {rest && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="mt-2 text-sm text-accent underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {expanded ? "Show less..." : "Read more..."}
            </button>
          )}
        </section>

        {/* Social */}
        <div className="mt-5" data-live2d-hover="socials">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Connect with me
          </h2>
          <div className="flex gap-2">
            {SOCIAL_LINKS.map((link) => {
              const Icon = ICON_MAP[link.name];
              return Icon ? (
                <SocialButton key={link.name} href={link.url} icon={Icon} label={link.label} />
              ) : null;
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
