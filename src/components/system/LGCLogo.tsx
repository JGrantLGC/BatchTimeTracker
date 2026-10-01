import { cn } from "@/lib/utils";

export type LGCLogoVariant = "masterbrand" | "reversed" | "mono";

interface LGCLogoProps {
  variant?: LGCLogoVariant;
  className?: string;
  title?: string;
}

const officialLogoPath = "/LGC_D%26G_Logos_RGB_LGC_D%26G_Primary_%281%29_%281%29.png";

export function LGCLogo({
  variant = "masterbrand",
  className,
  title = "LGC Diagnostics & Genomics",
}: LGCLogoProps) {
  const isHeaderLogo = variant === "reversed";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        isHeaderLogo && "rounded-md bg-white px-2 py-1",
        className,
      )}
    >
      <img
        src={officialLogoPath}
        alt={title}
        className="block h-full w-full object-contain"
      />
    </span>
  );
}

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
