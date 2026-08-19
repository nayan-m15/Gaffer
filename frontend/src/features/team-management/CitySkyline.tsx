/**
 * Decorative city skyline silhouette rendered behind the football pitch.
 *
 * Uses CSS variables from the existing design system so the skyline adapts
 * automatically to light and dark mode. The silhouette sits at a very low
 * opacity to avoid distracting from the tactical board.
 */

import { cn } from "@/lib/utils";

interface CitySkylineProps {
  className?: string;
}

export function CitySkyline({ className }: CitySkylineProps) {
  return (
    <div
      className={cn("overflow-hidden opacity-[0.07] dark:opacity-[0.05]", className)}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 800 200"
        className="absolute inset-x-0 bottom-0 h-full w-full"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Building cluster — left side */}
        <rect x="20" y="80" width="30" height="120" rx="1" fill="currentColor" />
        <rect x="25" y="70" width="8" height="10" rx="0.5" fill="currentColor" />
        <rect x="55" y="50" width="25" height="150" rx="1" fill="currentColor" />
        <rect x="60" y="40" width="6" height="10" rx="0.5" fill="currentColor" />
        <rect x="85" y="90" width="35" height="110" rx="1" fill="currentColor" />
        <rect x="125" y="60" width="20" height="140" rx="1" fill="currentColor" />
        <rect x="130" y="52" width="5" height="8" rx="0.5" fill="currentColor" />

        {/* Tall tower cluster — left-center */}
        <rect x="155" y="25" width="22" height="175" rx="1" fill="currentColor" />
        <rect x="161" y="12" width="10" height="13" rx="0.5" fill="currentColor" />
        <rect x="165" y="5" width="2" height="7" fill="currentColor" />
        <rect x="182" y="70" width="28" height="130" rx="1" fill="currentColor" />
        <rect x="215" y="55" width="18" height="145" rx="1" fill="currentColor" />

        {/* Mid section — medium buildings */}
        <rect x="245" y="95" width="40" height="105" rx="1" fill="currentColor" />
        <rect x="290" y="75" width="22" height="125" rx="1" fill="currentColor" />
        <rect x="316" y="85" width="30" height="115" rx="1" fill="currentColor" />
        <rect x="350" y="60" width="18" height="140" rx="1" fill="currentColor" />

        {/* Central skyscraper cluster */}
        <rect x="375" y="15" width="28" height="185" rx="1" fill="currentColor" />
        <rect x="383" y="5" width="12" height="10" rx="0.5" fill="currentColor" />
        <rect x="387" y="0" width="4" height="5" fill="currentColor" />
        <rect x="408" y="35" width="22" height="165" rx="1" fill="currentColor" />
        <rect x="435" y="50" width="30" height="150" rx="1" fill="currentColor" />
        <rect x="470" y="40" width="20" height="160" rx="1" fill="currentColor" />
        <rect x="476" y="30" width="8" height="10" rx="0.5" fill="currentColor" />

        {/* Right-center buildings */}
        <rect x="498" y="80" width="35" height="120" rx="1" fill="currentColor" />
        <rect x="538" y="65" width="22" height="135" rx="1" fill="currentColor" />
        <rect x="565" y="90" width="28" height="110" rx="1" fill="currentColor" />
        <rect x="598" y="70" width="18" height="130" rx="1" fill="currentColor" />

        {/* Right tall tower */}
        <rect x="622" y="30" width="24" height="170" rx="1" fill="currentColor" />
        <rect x="628" y="18" width="12" height="12" rx="0.5" fill="currentColor" />
        <rect x="632" y="10" width="4" height="8" fill="currentColor" />
        <rect x="650" y="75" width="30" height="125" rx="1" fill="currentColor" />
        <rect x="685" y="85" width="22" height="115" rx="1" fill="currentColor" />

        {/* Far right buildings */}
        <rect x="712" y="95" width="35" height="105" rx="1" fill="currentColor" />
        <rect x="752" y="80" width="25" height="120" rx="1" fill="currentColor" />

        {/* Window dots scattered across larger buildings */}
        <g fill="currentColor" opacity="0.3">
          {/* Left tall tower windows */}
          <rect x="159" y="35" width="2" height="2" /><rect x="165" y="35" width="2" height="2" /><rect x="171" y="35" width="2" height="2" />
          <rect x="159" y="45" width="2" height="2" /><rect x="165" y="45" width="2" height="2" /><rect x="171" y="45" width="2" height="2" />
          <rect x="159" y="55" width="2" height="2" /><rect x="165" y="55" width="2" height="2" /><rect x="171" y="55" width="2" height="2" />
          <rect x="159" y="65" width="2" height="2" /><rect x="165" y="65" width="2" height="2" /><rect x="171" y="65" width="2" height="2" />
          <rect x="159" y="80" width="2" height="2" /><rect x="165" y="80" width="2" height="2" /><rect x="171" y="80" width="2" height="2" />
          <rect x="159" y="95" width="2" height="2" /><rect x="165" y="95" width="2" height="2" /><rect x="171" y="95" width="2" height="2" />

          {/* Central skyscraper windows */}
          <rect x="380" y="25" width="2" height="2" /><rect x="386" y="25" width="2" height="2" /><rect x="392" y="25" width="2" height="2" />
          <rect x="380" y="35" width="2" height="2" /><rect x="386" y="35" width="2" height="2" /><rect x="392" y="35" width="2" height="2" />
          <rect x="380" y="50" width="2" height="2" /><rect x="386" y="50" width="2" height="2" /><rect x="392" y="50" width="2" height="2" />
          <rect x="380" y="65" width="2" height="2" /><rect x="386" y="65" width="2" height="2" /><rect x="392" y="65" width="2" height="2" />
          <rect x="380" y="80" width="2" height="2" /><rect x="386" y="80" width="2" height="2" /><rect x="392" y="80" width="2" height="2" />
          <rect x="380" y="100" width="2" height="2" /><rect x="386" y="100" width="2" height="2" /><rect x="392" y="100" width="2" height="2" />
          <rect x="380" y="120" width="2" height="2" /><rect x="386" y="120" width="2" height="2" /><rect x="392" y="120" width="2" height="2" />

          {/* Right tower windows */}
          <rect x="626" y="40" width="2" height="2" /><rect x="632" y="40" width="2" height="2" /><rect x="638" y="40" width="2" height="2" />
          <rect x="626" y="55" width="2" height="2" /><rect x="632" y="55" width="2" height="2" /><rect x="638" y="55" width="2" height="2" />
          <rect x="626" y="70" width="2" height="2" /><rect x="632" y="70" width="2" height="2" /><rect x="638" y="70" width="2" height="2" />
          <rect x="626" y="85" width="2" height="2" /><rect x="632" y="85" width="2" height="2" /><rect x="638" y="85" width="2" height="2" />
          <rect x="626" y="105" width="2" height="2" /><rect x="632" y="105" width="2" height="2" /><rect x="638" y="105" width="2" height="2" />

          {/* Scattered windows on other buildings */}
          <rect x="60" y="60" width="2" height="2" /><rect x="66" y="60" width="2" height="2" />
          <rect x="60" y="75" width="2" height="2" /><rect x="66" y="75" width="2" height="2" />
          <rect x="60" y="90" width="2" height="2" /><rect x="66" y="90" width="2" height="2" />
          <rect x="250" y="105" width="2" height="2" /><rect x="258" y="105" width="2" height="2" /><rect x="266" y="105" width="2" height="2" />
          <rect x="250" y="120" width="2" height="2" /><rect x="258" y="120" width="2" height="2" /><rect x="266" y="120" width="2" height="2" />
          <rect x="440" y="60" width="2" height="2" /><rect x="448" y="60" width="2" height="2" /><rect x="456" y="60" width="2" height="2" />
          <rect x="440" y="75" width="2" height="2" /><rect x="448" y="75" width="2" height="2" /><rect x="456" y="75" width="2" height="2" />
          <rect x="440" y="95" width="2" height="2" /><rect x="448" y="95" width="2" height="2" /><rect x="456" y="95" width="2" height="2" />
          <rect x="505" y="90" width="2" height="2" /><rect x="513" y="90" width="2" height="2" /><rect x="521" y="90" width="2" height="2" />
          <rect x="505" y="105" width="2" height="2" /><rect x="513" y="105" width="2" height="2" /><rect x="521" y="105" width="2" height="2" />
        </g>
      </svg>
    </div>
  );
}
