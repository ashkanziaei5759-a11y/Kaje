import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicMenu } from '@/server/services/menu';
import { MenuBrowser } from './MenuBrowser';

// Rendered per request, not statically prerendered.
//
// The menu's content is time-dependent — category serving windows open and
// close through the day, and items flip to sold out as stock runs down. A
// build-time prerender freezes both: the page shipped showing every category
// as closed, because the build ran at 11:00 UTC and judged a 12:00 Tehran
// opening against the wrong clock.
//
// Speed comes from the service worker instead, which caches the rendered menu
// on the device. That also means `next build` no longer needs database access.
export const dynamic = 'force-dynamic';

const RESTAURANT_SLUG = process.env.RESTAURANT_SLUG ?? 'kajeh';

export async function generateMetadata(): Promise<Metadata> {
  const menu = await getPublicMenu(RESTAURANT_SLUG);
  if (!menu) return { title: 'منو' };
  return {
    title: `منوی ${menu.restaurant.namePersian}`,
    description: `منوی دیجیتال ${menu.restaurant.namePersian}`,
    openGraph: {
      title: `منوی ${menu.restaurant.namePersian}`,
      type: 'website',
    },
  };
}

export default async function PublicMenuPage() {
  const menu = await getPublicMenu(RESTAURANT_SLUG);
  if (!menu) notFound();
  return <MenuBrowser menu={menu} />;
}
