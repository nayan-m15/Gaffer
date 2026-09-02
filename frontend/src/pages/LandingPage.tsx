import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Footer } from "@/components/landing/Footer";
import { HowItWorksSection } from "@/pages/HowItWorksPage";
import { FeaturesSection } from "@/pages/FeaturesPage";

/**
 * LandingPage — Combined scrollable Home page.
 *
 * Merges the three public marketing pages into a single scrollable experience:
 *   1. Landing / Hero section (dark cinematic pitch background)
 *   2. How It Works section (stadium background, 8 content sections)
 *   3. Features section (stadium background, 11 content sections)
 *
 * Each section has its own background treatment and scroll-reveal observer.
 * The Navbar is rendered once at the top and the Footer once at the bottom —
 * individual sections do not duplicate these global elements.
 *
 * Anchor navigation:
 *   - `/#how-it-works` scrolls to the How It Works section
 *   - `/#features` scrolls to the Features section
 *   - `scroll-smooth` on <html> (via index.css) provides smooth scrolling
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 flex-col">
        <section id="home">
          <Hero />
        </section>

        <HowItWorksSection />

        <FeaturesSection />
      </main>

      <Footer />
    </div>
  );
}
