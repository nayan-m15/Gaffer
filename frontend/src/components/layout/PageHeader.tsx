import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Main heading text or custom node */
  title: ReactNode;
  /** Subheading/description below the title */
  subtitle?: ReactNode;
  /** Action buttons, indicators, or tools displayed on the right side */
  actions?: ReactNode;
  /** Optional additional row or sub-navigation rendered inside the header */
  children?: ReactNode;
  /** Additional custom class names for the header container */
  className?: string;
}

/**
 * Standardized page header component for authenticated views.
 *
 * Ensures consistent typography (uppercase tracking, font sizes),
 * border-bottom separation, padding, and responsive action placement
 * across all pages.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // Mobile: clear fixed sidebar toggle (left-4 top-4) horizontally and vertically
        "border-b border-border pt-16 pb-6 pl-16 pr-6 sm:pr-8 lg:px-8 lg:py-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-foreground sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {actions}
          </div>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
