import { FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Certificate } from "@/types/content";
import certificates from "@content/certificates.json";

const data = certificates as Certificate[];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function CertificateCard() {
  const prefersReduced = useReducedMotion();

  return (
    <Card>
      <div data-live2d-hover="certs">
      <SectionTitle icon={FileText}>Certificates</SectionTitle>

      <div className="relative ml-3 border-l-2 border-stone-200 pl-6 dark:border-stone-700">
        {data.map((cert, i) => (
          <motion.div
            key={cert.title + cert.date}
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={
              prefersReduced ? { duration: 0 } : { duration: 0.35, delay: i * 0.1 }
            }
            className="relative pb-6 last:pb-0"
          >
            {/* Dot */}
            <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-accent bg-surface-card-light dark:bg-surface-card-dark" />

            <h3 className="font-heading text-base text-stone-800 dark:text-stone-100">
              {cert.title}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {formatDate(cert.date)} &mdash; {cert.issuer}
            </p>
            {cert.pdfUrl && (
              <a
                href={`certificates/${cert.pdfUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download certificate PDF"
                className="mt-1 inline-flex items-center gap-1 text-sm text-accent transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <Download size={14} />
                Download
              </a>
            )}
          </motion.div>
        ))}
      </div>
      </div>
    </Card>
  );
}
