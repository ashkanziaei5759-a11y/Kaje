import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicMenu } from '@/server/services/menu';
import { MenuBrowser } from './MenuBrowser';

// The public menu is the one page a customer sees, usually on a phone with a
// weak connection at a table. Cache it and revalidate every couple of minutes
// rather than hitting the database on every scan.
export const revalidate = 120;

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
