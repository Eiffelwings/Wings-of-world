import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  showSubtitle?: boolean;
};

export function BrandLogo({
  className,
  markClassName,
  size = "md",
  showWordmark = true,
  showSubtitle = false,
}: BrandLogoProps) {
  return (
    <div className={cn("wow-brand-logo", `wow-brand-logo--${size}`, className)} aria-label="Wings Of World logo">
      <span className={cn("wow-logo-mark", markClassName)} aria-hidden="true">
        <span className="wow-logo-aura" />
        <svg className="wow-logo-svg" viewBox="0 0 360 220" role="img" focusable="false">
          <defs>
            <linearGradient id="wowSteel" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="45%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#172033" />
            </linearGradient>
            <linearGradient id="wowWing" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#132238" />
              <stop offset="48%" stopColor="#475569" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="wowCyanBlade" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.96" />
              <stop offset="100%" stopColor="#0891b2" stopOpacity="0.72" />
            </linearGradient>
            <radialGradient id="wowChestCore" cx="45%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#fff7b3" />
              <stop offset="45%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
          </defs>

          <g className="wow-bird-circuit wow-bird-circuit--left">
            <path d="M124 64 L92 34 L52 32" />
            <path d="M112 94 L64 88 L38 112" />
            <circle cx="50" cy="32" r="4" />
            <circle cx="38" cy="112" r="4" />
          </g>
          <g className="wow-bird-circuit wow-bird-circuit--right">
            <path d="M236 64 L268 34 L308 32" />
            <path d="M248 94 L296 88 L322 112" />
            <circle cx="310" cy="32" r="4" />
            <circle cx="322" cy="112" r="4" />
          </g>

          <g className="wow-bird-wing wow-bird-wing--left">
            <path className="wow-bird-wing-main" d="M174 84 L118 38 L18 50 L82 101 L148 117 Z" />
            <path className="wow-bird-feather wow-bird-feather--dark" d="M26 64 L88 78 L115 100 L72 100 Z" />
            <path className="wow-bird-feather" d="M83 102 L139 119 L117 146 L64 126 Z" />
            <path className="wow-bird-feather" d="M122 121 L156 134 L143 171 L103 145 Z" />
            <path className="wow-bird-cyan" d="M48 80 L97 88 L116 101 L62 98 Z" />
            <path className="wow-bird-cyan" d="M91 120 L130 131 L116 147 L79 133 Z" />
            <path className="wow-bird-line" d="M42 56 L113 77 L166 97" />
            <path className="wow-bird-line" d="M66 113 L124 124 L157 125" />
            <circle className="wow-bird-node" cx="111" cy="92" r="4" />
            <circle className="wow-bird-node" cx="137" cy="130" r="4" />
          </g>

          <g className="wow-bird-wing wow-bird-wing--right">
            <path className="wow-bird-wing-main" d="M186 84 L242 38 L342 50 L278 101 L212 117 Z" />
            <path className="wow-bird-feather wow-bird-feather--dark" d="M334 64 L272 78 L245 100 L288 100 Z" />
            <path className="wow-bird-feather" d="M277 102 L221 119 L243 146 L296 126 Z" />
            <path className="wow-bird-feather" d="M238 121 L204 134 L217 171 L257 145 Z" />
            <path className="wow-bird-cyan" d="M312 80 L263 88 L244 101 L298 98 Z" />
            <path className="wow-bird-cyan" d="M269 120 L230 131 L244 147 L281 133 Z" />
            <path className="wow-bird-line" d="M318 56 L247 77 L194 97" />
            <path className="wow-bird-line" d="M294 113 L236 124 L203 125" />
            <circle className="wow-bird-node" cx="249" cy="92" r="4" />
            <circle className="wow-bird-node" cx="223" cy="130" r="4" />
          </g>

          <g className="wow-bird-body">
            <path className="wow-bird-tail" d="M158 152 L180 205 L202 152 L190 174 L180 165 L170 174 Z" />
            <path className="wow-bird-torso" d="M144 92 L169 75 L191 75 L216 92 L203 160 L180 178 L157 160 Z" />
            <path className="wow-bird-plate wow-bird-plate--left" d="M151 101 L174 112 L170 153 L160 160 Z" />
            <path className="wow-bird-plate wow-bird-plate--right" d="M209 101 L186 112 L190 153 L200 160 Z" />
            <path className="wow-bird-head" d="M158 58 L180 43 L202 58 L196 83 L180 96 L164 83 Z" />
            <path className="wow-bird-face" d="M166 62 L180 54 L194 62 L190 76 L180 84 L170 76 Z" />
            <path className="wow-bird-beak" d="M173 78 L180 97 L187 78 L180 84 Z" />
            <circle className="wow-bird-eye" cx="172" cy="68" r="3" />
            <circle className="wow-bird-eye" cx="188" cy="68" r="3" />
            <circle className="wow-bird-core" cx="180" cy="124" r="12" />
            <circle className="wow-bird-core-inner" cx="180" cy="124" r="5" />
            <path className="wow-bird-claw wow-bird-claw--left" d="M160 166 L150 189 M150 189 L138 195 M150 189 L160 199" />
            <path className="wow-bird-claw wow-bird-claw--right" d="M200 166 L210 189 M210 189 L222 195 M210 189 L200 199" />
            <path className="wow-bird-leg wow-bird-leg--left" d="M162 160 L158 177" />
            <path className="wow-bird-leg wow-bird-leg--right" d="M198 160 L202 177" />
          </g>
        </svg>
      </span>
      {showWordmark ? (
        <span className="wow-logo-wordmark">
          <span className="wow-logo-title">Wings Of World</span>
          {showSubtitle ? <span className="wow-logo-subtitle">AI Operations Workspace</span> : null}
        </span>
      ) : null}
    </div>
  );
}
