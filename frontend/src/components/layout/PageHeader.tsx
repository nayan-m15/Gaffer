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
  /** Align the title and actions on one row on mobile. */
  mobileInline?: boolean;
}

/**
 * Standardized page header component for authenticated views.
 *
 * Ensures consistent typography, spacing, and responsive action placement
 * across all pages.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
  mobileInline = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // Mobile: clear fixed sidebar toggle (left-4 top-4) horizontally and vertically
        "mx-auto w-full max-w-[1600px] pt-8 pb-5 pl-16 pr-6 sm:pr-8 lg:px-10 lg:pb-6 lg:pt-9",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          mobileInline && "flex-row items-center justify-between gap-2",
        )}
      >
        <div className={mobileInline ? "min-w-0" : undefined}>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className={cn("flex flex-wrap items-center gap-3 sm:gap-4", mobileInline && "shrink-0")}>
            {actions}
          </div>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
