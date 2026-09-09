/**
 * Inline SVG icon set for the menu.
 *
 * Emoji were used here before and had to go: they render as a different glyph
 * on every platform, cannot be recoloured to match the theme, and are read
 * aloud by screen readers as their unicode name. These are drawn on a 24x24
 * grid with `currentColor` so they inherit text colour, and are marked
 * aria-hidden because the category name beside them already carries the label.
 */
import type { ReactElement } from 'react';

type IconProps = { className?: string };

const base = (className?: string) =>
  ({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
    focusable: 'false',
  }) as const;

export function SaladIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 12h18a9 9 0 0 1-18 0Z" />
      <path d="M5 16h14M12 12V8a3 3 0 0 1 3-3" />
      <circle cx="9" cy="9" r="1.6" />
    </svg>
  );
}

export function KebabIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2v20" />
      <rect x="8" y="5" width="8" height="4" rx="2" />
      <rect x="8" y="11" width="8" height="4" rx="2" />
      <rect x="8" y="17" width="8" height="3" rx="1.5" />
    </svg>
  );
}

export function BurgerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 9a9 5 0 0 1 18 0" />
      <path d="M3 13h18" />
      <path d="M4 16.5h16a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z" />
    </svg>
  );
}

export function PizzaIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 3.5 19a1 1 0 0 0 1.3 1.3L21 12Z" />
      <circle cx="11" cy="10" r="1.1" />
      <circle cx="9" cy="15" r="1.1" />
    </svg>
  );
}

export function DrinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7 4h10l-1.2 15a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8Z" />
      <path d="M7.5 10h9" />
    </svg>
  );
}

export function DessertIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8 10a4 4 0 0 1 8 0" />
      <path d="M5.5 13h13L12 21.5Z" />
      <path d="M12 6V4" />
    </svg>
  );
}

export function GrainIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 21V9" />
      <path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z" />
      <path d="M12 12c0-3-2-5-5-5 0 3 2 5 5 5Z" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 3h3.5l1.8 4.5-2.2 1.4a12 12 0 0 0 5.5 5.5l1.4-2.2L19.5 14V17a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3Z" />
    </svg>
  );
}

export function LocationIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg {...base(className)} fill="currentColor" stroke="none">
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8Z" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3v13" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function PlusSquareIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<string, (props: IconProps) => ReactElement> = {
  Appetizers: SaladIcon,
  'Main Dishes': KebabIcon,
  Burgers: BurgerIcon,
  Pizza: PizzaIcon,
  Drinks: DrinkIcon,
  Desserts: DessertIcon,
};

/** Picks an icon by the category's English name, falling back to a grain mark. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? GrainIcon;
  return <Icon className={className} />;
}
