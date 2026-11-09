import { BRAND } from '@/lib/brand';

type Variant = 'full' | 'lockup' | 'mark';

const SRC: Record<Variant, { light: string; dark: string }> = {
  full: {
    light: '/brand/myla-logo-full.png',
    dark: '/brand/myla-logo-full-light.png',
  },
  lockup: {
    light: '/brand/myla-logo-lockup.png',
    dark: '/brand/myla-logo-lockup-light.png',
  },
  mark: {
    light: '/brand/myla-mark.png',
    dark: '/brand/myla-mark-light.png',
  },
};

/** The user-supplied MYLA logo, in light- and dark-background variants.
 *  `autoDark` renders both and lets Tailwind's `.dark` class choose one. */
export default function Logo({
  variant = 'lockup',
  light = false,
  autoDark = false,
  className = '',
  title,
}: {
  variant?: Variant;
  light?: boolean;
  autoDark?: boolean;
  className?: string;
  title?: string;
}) {
  const set = SRC[variant];
  const alt = title || `${BRAND.name} — ${BRAND.descriptorTitleCase}`;
  if (autoDark) {
    return <>
      {/* Light backgrounds */}
      <img src={set.light} alt={alt} draggable={false} className={`${className} dark:hidden`} />
      {/* Dark backgrounds */}
      <img src={set.dark} alt={alt} draggable={false} className={`${className} hidden dark:block`} />
    </>;
  }
  return <img src={light ? set.dark : set.light} alt={alt} draggable={false} className={className} />;
}
