import { SportLogo } from "@/components/brand/SportLogo";
import { brand } from "@/data/brand";
import { motion, type Variants } from "motion/react";

const PRIMARY_LINKS = [
  { label: "Public Dashboard", href: "/public-dashboard" },
  { label: "Philosophy", href: "/#philosophy" },
  { label: "Tactical Pitch", href: "/#tactics" },
  { label: "Analytics", href: "/#analytics" },
] as const;

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms-of-service.html" },
  { label: "Privacy Policy", href: "/privacy-policy.html" },
] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
    },
  },
};

/** Animated marketing footer shared by GAFFER's public pages. */
export function Footer() {
  return (
    <footer className="relative z-10 w-full overflow-hidden border-t border-border bg-background/95 text-foreground shadow-[0_-12px_40px_rgb(0_0_0/0.18)] backdrop-blur-xl">
      <motion.div
        className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 pb-3 pt-12 text-center sm:px-6 sm:pb-4 sm:pt-14 lg:px-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "0px 0px -80px 0px" }}
        variants={containerVariants}
      >
        <motion.a
          href="/#home"
          variants={itemVariants}
          className="group inline-flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          <SportLogo size={40} className="rounded-md" />
          <span className="font-display text-xl font-bold tracking-tight">
            {brand.name}
          </span>
        </motion.a>

        <motion.nav aria-label="Footer navigation" variants={itemVariants}>
          <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 sm:gap-x-4">
            {PRIMARY_LINKS.map((link) => (
              <li key={link.href}>
                <motion.a
                  href={link.href}
                  className="group relative block min-h-11 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-md bg-accent"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  />
                  <span className="relative z-10">{link.label}</span>
                </motion.a>
              </li>
            ))}
          </ul>
        </motion.nav>

        <motion.p variants={itemVariants} className="text-sm text-muted-foreground">
          © 2026 GAFFER. All rights reserved.
        </motion.p>
      </motion.div>      

      <motion.nav
        aria-label="Legal navigation"
        className="mx-auto max-w-7xl px-4 pb-6 pt-0 sm:px-6 lg:px-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={itemVariants}
      >
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </motion.nav>
    </footer>
  );
}
