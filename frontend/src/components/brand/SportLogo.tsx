/**
 * SportLogo — Brand logo image for the Sport Coaching Tool.
 *
 * Shares responsive transparent WebP assets with the HTML preloader.
 * The component accepts an optional `size` prop (in px) so it can be rendered
 * at navbar, favicon or hero scale, and a `className` prop for additional
 * Tailwind / CSS overrides.
 *
 * Usage:
 *   import { SportLogo } from "@/components/brand/SportLogo";
 *   <SportLogo size={40} />
 */


interface SportLogoProps {
  /** Width & height in pixels — defaults to 32 (navbar size). */
  size?: number;
  /** Additional CSS class names forwarded to the root `<img>`. */
  className?: string;
  /** Optional alt text — defaults to the brand name. */
  alt?: string;
}

export function SportLogo({ size = 32, className, alt = "GAFFER logo" }: SportLogoProps) {
  return (
    <img
      src="/logo-112.webp"
      srcSet="/logo-112.webp 112w, /logo-224.webp 224w, /logo-634.webp 634w"
      sizes={`${size}px`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={className}
    />
  );
}
