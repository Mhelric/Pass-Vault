export const VAULT_BG_GIFS = [
  '/signin-bg.gif',
  '/signin-bg-2.gif',
  '/signin-bg-3.gif',
  '/signin-bg-4.gif',
  '/signin-bg-5.gif',
  '/signin-bg-6.gif',
  '/signin-bg-7.gif',
  '/signin-bg-8.gif',
];

export interface VaultBackgroundProps {
  activeIndex: number;
}

export function VaultBackground({ activeIndex }: VaultBackgroundProps) {
  return (
    <>
      {VAULT_BG_GIFS.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 h-full w-full object-cover scale-105 transition-opacity duration-700 ${
            idx === activeIndex ? 'opacity-75' : 'opacity-0'
          }`}
        />
      ))}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#09090b]/45 via-[#120d1f]/35 to-[#09090b]/60"
      />
    </>
  );
}
