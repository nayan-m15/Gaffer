import { cn } from "@/lib/utils";

interface CitySkylineProps {
  className?: string;
}

/**
 * Detailed Johannesburg-style architectural line illustration.
 *
 * The artwork is supplied as a vector SVG traced from the reference image.
 * The title and download icon from the reference are intentionally omitted.
 *
 * The component provides:
 * - subtle architectural drafting grid
 * - detailed skyline linework
 * - central telecommunications tower
 * - foreground roads
 * - trees and landscaping
 * - circular stadium/arena
 *
 * The illustration uses currentColor so it automatically follows the
 * application's existing light/dark color system.
 */
export function CitySkyline({ className }: CitySkylineProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        "bg-[linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)]",
        "bg-[size:39px_39px]",
        "dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)]",
        className,
      )}
    >
      <img
        src="/johannesburg-line-art.svg"
        alt=""
        draggable={false}
        className={cn(
          "absolute inset-x-0 bottom-0",
          "w-full",
          "h-auto",
          "max-h-full",
          "object-contain object-bottom",
          "select-none",
          "text-foreground",
          "opacity-[0.55]",
          "dark:opacity-[0.42]",
        )}
      />
    </div>
  );
}