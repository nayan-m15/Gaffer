/**
 * Fallback panel for the Team Tactics tabs that aren't wired to a data model
 * yet (Squad, Instructions). Explains what the tab is for and points to where
 * the related work currently happens.
 */

import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface PlaceholderTabProps {
  icon: LucideIcon;
  title: string;
  description: string;
  linkTo?: string;
  linkLabel?: string;
}

export function PlaceholderTab({
  icon: Icon,
  title,
  description,
  linkTo,
  linkLabel,
}: PlaceholderTabProps) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <Icon className="size-9 text-muted-foreground/50" aria-hidden="true" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {linkTo && linkLabel && (
        <Link
          to={linkTo}
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </section>
  );
}
