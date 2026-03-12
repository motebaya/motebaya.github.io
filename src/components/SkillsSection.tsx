import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Wrench, Monitor } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Badge from "@/components/ui/Badge";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { SkillsData } from "@/types/content";
import skillsData from "@content/skills.json";

const data = skillsData as SkillsData;

export default function SkillsSection() {
  const [selected, setSelected] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();

  const handleToggle = (name: string) => {
    setSelected((prev) => (prev === name ? null : name));
  };

  const selectedSkill = data.skills.find((s) => s.name === selected);

  return (
    <Card>
      <div data-live2d-hover="skills">
        <SectionTitle icon={Code}>Skills</SectionTitle>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Click a skill to learn about my experience with it.
        </p>

        {/* Primary skills */}
        <div className="flex flex-wrap gap-2">
          {data.skills.map((skill) => {
            const isActive = selected === skill.name;
            return (
              <button
                key={skill.name}
                onClick={() => handleToggle(skill.name)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  isActive
                    ? "border-accent bg-accent/10 text-accent dark:bg-accent/20"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:border-accent/50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-accent/50"
                }`}
              >
                <img
                  src={skill.icon}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px]"
                  loading="lazy"
                />
                {skill.name}
              </button>
            );
          })}
        </div>

        {/* Expanded description */}
        <AnimatePresence mode="wait">
          {selectedSkill && (
            <motion.div
              key={selectedSkill.name}
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-stone-700 dark:bg-accent/10 dark:text-stone-300">
                {selectedSkill.description}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Technologies subsection */}
        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-700">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <Wrench size={14} />
            Technologies and tools
          </div>
          <motion.div
            className="flex flex-wrap gap-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              visible: {
                transition: {
                  staggerChildren: prefersReduced ? 0 : 0.04,
                },
              },
            }}
          >
            {data.technologies.map((tech) => (
              <motion.div
                key={tech.name}
                variants={
                  prefersReduced
                    ? {}
                    : {
                        hidden: { opacity: 0, scale: 0.9 },
                        visible: { opacity: 1, scale: 1 },
                      }
                }
              >
                <Badge icon={tech.icon} label={tech.name} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Operating Systems subsection */}
        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-700">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <Monitor size={14} />
            OS / Operating System
          </div>
          <motion.div
            className="flex flex-wrap gap-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              visible: {
                transition: {
                  staggerChildren: prefersReduced ? 0 : 0.04,
                },
              },
            }}
          >
            {data.operatingSystems.map((os) => (
              <motion.div
                key={os.name}
                variants={
                  prefersReduced
                    ? {}
                    : {
                        hidden: { opacity: 0, scale: 0.9 },
                        visible: { opacity: 1, scale: 1 },
                      }
                }
              >
                <Badge icon={os.icon} label={os.name} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </Card>
  );
}
