import { useId } from 'react';

export interface VaultLogoProps {
  className?: string;
}

/**
 * Pass-Vault glowing neon purple padlock-shield emblem.
 */
export function VaultLogo({ className = 'w-8 h-8' }: VaultLogoProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `vault-neon-${uid}`;
  const glowId = `vault-glow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="122 86 268 334"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="256" y1="104" x2="256" y2="404" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0ABFC" />
          <stop offset="38%" stopColor="#D946EF" />
          <stop offset="72%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`} stroke={`url(#${gradId})`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M 198 197 V 164 C 198 130, 224 106, 256 106 C 288 106, 314 130, 314 164 V 168" strokeWidth="20" />
        <path
          d="M 256 174 C 228 194, 194 206, 160 210 C 160 302, 192 366, 256 400 C 320 366, 352 302, 352 210 C 318 206, 284 194, 256 174 Z"
          strokeWidth="20"
        />
        <circle cx="256" cy="272" r="19" strokeWidth="16" />
        <path d="M 256 292 V 326" strokeWidth="16" />
      </g>
    </svg>
  );
}
