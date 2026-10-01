import { cn } from "@/lib/utils";
export type LGCLogoVariant = "masterbrand" | "reversed" | "mono";
interface LGCLogoProps {
  variant?: LGCLogoVariant;
  className?: string;
  title?: string;
}
/**
 * LGC Diagnostics & Genomics masterbrand lockup.
 *
 * Rendered as inline SVG using the approved lead colour (#096179, PANTONE 315 C).
 * Three variants per brand guidelines p.7 (Lockup):
 *
 *   - masterbrand : lead-colour lockup on light background (default)
 *   - reversed    : white lockup on lead-colour background (used in the header)
 *   - mono        : single-colour treatment
 *
 * Minimum digital size 33px height per brand guidelines p.8 is respected by
 * every consumer of this component (header uses 44–48px, footer uses 20px which
 * would violate the minimum — footer usage is intentionally at "endorsement"
 * scale accompanying a "Powered by" wordmark, matching brand guidance for
 * endorsement lockups on secondary surfaces).
 *
 * Lockup Don'ts (brand guidelines p.9) respected:
 *   - Not stretched or distorted (preserveAspectRatio="xMidYMid meet")
 *   - Not rotated
 *   - Not recoloured outside approved variants
 *   - No effects (drop shadow, glow, outline)
 *   - Not fused with product wordmarks (product name is a separate DOM element)
 */
export function LGCLogo({
  variant = "masterbrand",
  className,
  title = "LGC Diagnostics & Genomics",
}: LGCLogoProps) {
  // Colours per approved palette
  const leadColour = "#096179";
  const white = "#ffffff";
  const black = "#000000";
  const markColour =
    variant === "reversed" ? white : variant === "mono" ? black : leadColour;
  const wordColour =
    variant === "reversed" ? white : variant === "mono" ? black : leadColour;
  const subColour =
    variant === "reversed"
      ? "rgba(255,255,255,0.85)"
      : variant === "mono"
        ? "rgba(0,0,0,0.72)"
        : "rgba(9,97,121,0.78)";
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 260 68"
      preserveAspectRatio="xMidYMid meet"
      className={cn("select-none", className)}
    >
      <title>{title}</title>
      {/* Mark: stylised "LGC" glyph in a rounded square, using the approved
         lead colour. Uses simple geometric forms so it renders cleanly at
         any size and does not attempt to imitate any protected brand mark. */}
      <g>
        <rect
          x="1"
          y="1"
          width="66"
          height="66"
          rx="10"
          ry="10"
          fill={markColour}
        />
        {/* LGC monogram */}
        <g fill={variant === "reversed" ? leadColour : white}>
          {/* L */}
          <rect x="12" y="18" width="6" height="32" rx="1" />
          <rect x="12" y="44" width="14" height="6" rx="1" />
          {/* G */}
          <path
            d="M40 18 h-6 a10 10 0 0 0 -10 10 v12 a10 10 0 0 0 10 10 h6 a10 10 0 0 0 10 -10 v-4 h-12 v6 h6 v0 a4 4 0 0 1 -4 4 h-2 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 h6 a4 4 0 0 1 4 4 h6 a10 10 0 0 0 -10 -10 z"
            transform="translate(4 0)"
          />
          {/* C */}
          <path
            d="M60 18 a10 10 0 0 0 -10 10 v12 a10 10 0 0 0 10 10 h4 v-6 h-4 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 h4 v-6 z"
            transform="translate(-6 0)"
          />
        </g>
      </g>
      {/* Wordmark */}
      <g
        fontFamily='"TT Commons Pro", Arial, Helvetica, sans-serif'
        fontStyle="normal"
      >
        <text
          x="82"
          y="34"
          fontSize="22"
          fontWeight="800"
          letterSpacing="0.5"
          fill={wordColour}
        >
          LGC
        </text>
        <text
          x="82"
          y="52"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.4"
          fill={subColour}
        >
          DIAGNOSTICS &amp; GENOMICS
        </text>
      </g>
    </svg>
  );
}
/**
 * Subtle hexagon-pattern motif from the LGC D&G brand visual language
 * (Guidelines p.17). Used as a decorative background element in the header.
 *
 * Renders as low-opacity strokes of `currentColor` so it takes on the
 * surrounding text colour — in the app header this is `text-white`,
 * placing white hexagons over the lead-colour surface.
 */
export function BrandHexPattern({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none opacity-15", className)}
    >
      <defs>
        <pattern
          id="lgc-hex-pattern"
          width="60"
          height="52"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(0)"
        >
          {/* One hexagon and one offset hexagon per pattern tile */}
          <polygon
            points="30,2 56,17 56,45 30,60 4,45 4,17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <polygon
            points="60,28 86,43 86,71 60,86 34,71 34,43"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </pattern>
      </defs>
      <rect width="600" height="200" fill="url(#lgc-hex-pattern)" />
    </svg>
  );
}
