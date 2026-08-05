import type { ReactNode } from "react";
import { SECTIONS, type SectionDef } from "@/lib/content";
import { SectionHeading } from "./primitives";

/**
 * Section chrome. Server-rendered so the whole document exists in the initial
 * HTML — the interactive instruments are separate client leaves.
 */
export function Section({
  def,
  subtitle,
  aside,
  children,
  bare = false,
  className = "",
}: {
  def: SectionDef;
  subtitle: string;
  aside?: ReactNode;
  children: ReactNode;
  /** Skip the standard heading block (the hero draws its own). */
  bare?: boolean;
  className?: string;
}) {
  return (
    <section
      id={def.id}
      aria-labelledby={`${def.id}-title`}
      className={`border-rule scroll-mt-14 border-b px-4 py-16 sm:px-6 sm:py-20 lg:px-10 ${className}`}
    >
      <div className="mx-auto w-full max-w-7xl">
        {bare ? (
          <h2 id={`${def.id}-title`} className="sr-only">
            {def.label}
          </h2>
        ) : (
          <SectionHeading
            titleId={`${def.id}-title`}
            code={`${def.code} / ${SECTIONS.length}`}
            title={def.label}
            subtitle={subtitle}
            aside={aside}
          />
        )}
        {children}
      </div>
    </section>
  );
}
