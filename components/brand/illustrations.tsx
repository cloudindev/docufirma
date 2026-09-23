import { cn } from "@/lib/utils";

/**
 * Hand-made SVG illustrations (no stock imagery). Palette: ink, primary, soft blues,
 * success green accent. All decorative (aria-hidden).
 */

export function SignatureIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 360" fill="none" aria-hidden className={cn("h-auto w-full", className)}>
      {/* back sheet */}
      <rect
        x="92"
        y="34"
        width="236"
        height="296"
        rx="18"
        fill="#DCE6FF"
        transform="rotate(-6 210 182)"
      />
      {/* main document */}
      <rect x="84" y="24" width="252" height="312" rx="18" fill="#fff" />
      <rect x="84.5" y="24.5" width="251" height="311" rx="17.5" stroke="#E3E8F2" />
      <rect x="112" y="58" width="120" height="12" rx="6" fill="#0B1B3F" />
      <rect x="112" y="84" width="196" height="8" rx="4" fill="#E3E8F2" />
      <rect x="112" y="102" width="180" height="8" rx="4" fill="#E3E8F2" />
      <rect x="112" y="120" width="192" height="8" rx="4" fill="#E3E8F2" />
      <rect x="112" y="138" width="150" height="8" rx="4" fill="#E3E8F2" />
      <rect x="112" y="166" width="196" height="8" rx="4" fill="#E3E8F2" />
      <rect x="112" y="184" width="170" height="8" rx="4" fill="#E3E8F2" />
      {/* signature box */}
      <rect x="112" y="220" width="196" height="86" rx="12" fill="#F5F8FF" />
      <path
        d="M128 282c10-22 22-40 30-36 9 4-10 34 2 34 9 0 16-22 26-22 7 0 4 14 14 14 9 0 12-18 22-18 8 0 6 12 16 12 8 0 14-8 22-8"
        stroke="#1F4FE0"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="128" y="292" width="164" height="2" rx="1" fill="#C9D5F5" />
      {/* seal */}
      <g transform="translate(300 220)">
        <circle r="46" fill="#1F4FE0" />
        <circle r="38" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 5" />
        <path
          d="M-15 1l10 10 21-22"
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* timestamp chip */}
      <g transform="translate(24 244)">
        <rect width="136" height="44" rx="22" fill="#fff" />
        <rect x=".5" y=".5" width="135" height="43" rx="21.5" stroke="#E3E8F2" />
        <circle cx="22" cy="22" r="11" fill="#12B76A" fillOpacity=".15" />
        <circle cx="22" cy="22" r="7" stroke="#12B76A" strokeWidth="2" />
        <path d="M22 18v4l3 2" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" />
        <rect x="42" y="14" width="76" height="7" rx="3.5" fill="#0B1B3F" />
        <rect x="42" y="26" width="56" height="6" rx="3" fill="#C9D5F5" />
      </g>
      {/* shield chip */}
      <g transform="translate(262 40)">
        <rect width="118" height="44" rx="22" fill="#0B1B3F" />
        <path
          d="M24 12l10 4v7c0 6-4 10-10 12-6-2-10-6-10-12v-7l10-4Z"
          fill="#fff"
          fillOpacity=".9"
        />
        <rect x="44" y="15" width="56" height="6" rx="3" fill="#fff" />
        <rect x="44" y="25" width="40" height="5" rx="2.5" fill="#fff" fillOpacity=".5" />
      </g>
    </svg>
  );
}

export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 480" fill="none" aria-hidden className={cn("h-auto w-full", className)}>
      <defs>
        <radialGradient
          id="hero-glow"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(290 240) rotate(90) scale(240 280)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DCE6FF" />
          <stop offset="1" stopColor="#F5F8FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="290" cy="240" rx="280" ry="240" fill="url(#hero-glow)" />
      {/* stacked docs */}
      <rect
        x="170"
        y="70"
        width="250"
        height="320"
        rx="20"
        fill="#EAF0FF"
        transform="rotate(8 295 230)"
      />
      <rect x="150" y="60" width="260" height="330" rx="20" fill="#fff" />
      <rect x="150.5" y="60.5" width="259" height="329" rx="19.5" stroke="#E3E8F2" />
      <rect x="180" y="96" width="126" height="13" rx="6.5" fill="#0B1B3F" />
      <rect x="180" y="124" width="200" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="142" width="186" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="160" width="196" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="178" width="140" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="206" width="200" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="224" width="170" height="8" rx="4" fill="#E3E8F2" />
      <rect x="180" y="266" width="200" height="92" rx="14" fill="#F5F8FF" />
      <path
        d="M198 330c12-26 26-46 35-41 10 5-12 39 2 39 10 0 18-25 30-25 8 0 5 16 16 16 10 0 14-20 25-20 9 0 7 14 18 14 9 0 16-9 25-9"
        stroke="#1F4FE0"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="198" y="342" width="164" height="2" rx="1" fill="#C9D5F5" />
      {/* pen */}
      <g transform="translate(372 300) rotate(35)">
        <rect x="-7" y="-80" width="14" height="72" rx="7" fill="#0B1B3F" />
        <rect x="-7" y="-92" width="14" height="16" rx="4" fill="#1F4FE0" />
        <path d="M-7-8h14l-7 16-7-16Z" fill="#5B6B8C" />
      </g>
      {/* seal */}
      <g transform="translate(430 120)">
        <circle r="50" fill="#1F4FE0" />
        <circle r="41" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 5" />
        <path
          d="M-17 1l11 11 23-24"
          stroke="#fff"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* timestamp card */}
      <g transform="translate(60 300)">
        <rect width="170" height="72" rx="16" fill="#fff" />
        <rect x=".5" y=".5" width="169" height="71" rx="15.5" stroke="#E3E8F2" />
        <circle cx="30" cy="36" r="15" fill="#12B76A" fillOpacity=".12" />
        <circle cx="30" cy="36" r="9" stroke="#12B76A" strokeWidth="2.2" />
        <path d="M30 31v5l4 2.5" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="56" y="24" width="90" height="8" rx="4" fill="#0B1B3F" />
        <rect x="56" y="40" width="70" height="7" rx="3.5" fill="#C9D5F5" />
      </g>
      {/* hash card */}
      <g transform="translate(70 120)">
        <rect width="120" height="56" rx="14" fill="#0B1B3F" />
        <text
          x="18"
          y="35"
          fill="#fff"
          fontFamily="ui-monospace, monospace"
          fontSize="15"
          fontWeight="600"
        >
          SHA-256
        </text>
      </g>
    </svg>
  );
}

export function StepIllustration({ step, className }: { step: 1 | 2 | 3; className?: string }) {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className={cn("h-auto w-full", className)}>
      <rect x="0" y="0" width="120" height="96" rx="18" fill="#F5F8FF" />
      {step === 1 ? (
        <>
          <rect x="36" y="18" width="48" height="60" rx="8" fill="#fff" stroke="#E3E8F2" />
          <path
            d="M60 60V36m0 0-9 9m9-9 9 9"
            stroke="#1F4FE0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <rect x="24" y="26" width="72" height="46" rx="8" fill="#fff" stroke="#E3E8F2" />
          <path
            d="m26 30 34 24 34-24"
            stroke="#1F4FE0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <rect x="30" y="16" width="48" height="62" rx="8" fill="#fff" stroke="#E3E8F2" />
          <path
            d="M38 58c4-8 8-14 11-12 3 2-3 11 1 11 3 0 5-6 8-6 2 0 2 4 5 4"
            stroke="#1F4FE0"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="80" cy="66" r="16" fill="#12B76A" />
          <path
            d="m73 66 5 5 9-10"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </svg>
  );
}
