import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-5 md:auto-rows-[18rem] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | ReactNode;
  description?: string | ReactNode;
  header?: ReactNode;
  icon?: ReactNode;
}) => {
  return (
    <div
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.65)] backdrop-blur-xl transition duration-300 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_70px_-35px_rgba(16,185,129,0.35)] motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 motion-reduce:transition-none group-hover/bento:translate-x-1 motion-reduce:group-hover/bento:translate-x-0">
        {icon}
        <div className="mb-2 mt-2 font-sans font-bold text-foreground">
          {title}
        </div>
        <div className="font-sans text-xs font-normal leading-relaxed text-muted-foreground">
          {description}
        </div>
      </div>
    </div>
  );
};
