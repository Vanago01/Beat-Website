"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Carousel({ children, className, itemClassName }: { children: ReactNode[]; className?: string; itemClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [children.length]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className={cn("group/carousel relative", className)}>
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:gap-5 lg:-mx-8 lg:scroll-px-8 lg:px-8">
        {children.map((child, i) => (
          <div key={i} className={cn("w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[19%]", itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      {!edges.start && (
        <button
          onClick={() => scroll(-1)}
          className="glass-strong absolute -left-3 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full opacity-0 transition group-hover/carousel:opacity-100 md:grid"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {!edges.end && (
        <button
          onClick={() => scroll(1)}
          className="glass-strong absolute -right-3 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full opacity-0 transition group-hover/carousel:opacity-100 md:grid"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
