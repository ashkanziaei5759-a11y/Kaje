/**
 * Public menu assembly.
 *
 * Deliberately separate from the admin menu queries: this runs for anonymous
 * visitors, so it selects only what a customer should see. Costs, margins and
 * supplier data never enter the payload.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface PublicMenuItem {
  id: string;
  name: string;
  namePersian: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  isAvailable: boolean;
  isFeatured: boolean;
  allergens: string[];
  calories: number | null;
  modifiers: Array<{ id: string; name: string; priceDelta: string }>;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  namePersian: string;
  icon: string | null;
  /** Human-readable serving window, when the category has one. */
  servingWindow: string | null;
  isServingNow: boolean;
  items: PublicMenuItem[];
}

export interface PublicMenu {
  restaurant: {
    name: string;
    namePersian: string;
    phone: string | null;
    address: string | null;
    currencySymbol: string;
  };
  categories: PublicMenuCategory[];
  generatedAt: string;
}

const minutesToClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Wall-clock time in a named IANA timezone.
 *
 * Uses Intl rather than a fixed offset so daylight saving and any future
 * change to Iran's offset are handled by the platform's tz database instead of
 * arithmetic that silently goes stale.
 *
 * Returns dayOfWeek on the Iranian week, where 0 = Saturday, matching how
 * MenuAvailability rows are stored.
 */
export function localTimeIn(
  timezone: string,
  at: Date = new Date(),
): { minuteOfDay: number; dayOfWeek: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(at);
  } catch {
    // An unknown timezone string must not take the menu down; fall back to the
    // server clock and carry on.
    return {
      minuteOfDay: at.getHours() * 60 + at.getMinutes(),
      dayOfWeek: (at.getDay() + 1) % 7,
    };
  }

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  // Intl renders midnight as "24" in some environments under hour12: false.
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));

  const SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sundayIndex = SUNDAY_FIRST.indexOf(value('weekday'));

  return {
    minuteOfDay: hour * 60 + minute,
    dayOfWeek: sundayIndex < 0 ? 0 : (sundayIndex + 1) % 7,
  };
}

export async function getPublicMenu(slug: string): Promise<PublicMenu | null> {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) return null;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isVisible: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      availability: true,
      items: {
        // HIDDEN items are excluded entirely; UNAVAILABLE ones are shown but
        // marked sold out, so customers can still see the full offering.
        where: { isActive: true, availability: { in: ['AVAILABLE', 'UNAVAILABLE'] } },
        orderBy: [{ sortOrder: 'asc' }, { namePersian: 'asc' }],
        include: {
          availability_: true,
          modifierGroups: {
            include: { modifier: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  // Serving windows must be judged by the RESTAURANT's clock, not the server's.
  // A Tehran restaurant on a UTC host would otherwise show its whole lunch
  // menu as out-of-hours during lunch.
  const now = new Date();
  const { minuteOfDay, dayOfWeek } = localTimeIn(restaurant.timezone, now);

  const withinWindow = (windows: Array<{ dayOfWeek: number | null; startMinute: number; endMinute: number }>) => {
    if (windows.length === 0) return true;
    return windows.some(
      (w) =>
        (w.dayOfWeek === null || w.dayOfWeek === dayOfWeek) &&
        minuteOfDay >= w.startMinute &&
        minuteOfDay <= w.endMinute,
    );
  };

  return {
    restaurant: {
      name: restaurant.name,
      namePersian: restaurant.namePersian,
      phone: restaurant.phone,
      address: restaurant.address,
      currencySymbol: restaurant.currencySymbol,
    },
    categories: categories
      .map((category): PublicMenuCategory => {
        const window = category.availability[0];
        return {
          id: category.id,
          name: category.name,
          namePersian: category.namePersian,
          icon: category.icon,
          servingWindow: window
            ? `${minutesToClock(window.startMinute)} – ${minutesToClock(window.endMinute)}`
            : null,
          isServingNow: withinWindow(category.availability),
          items: category.items.map((item): PublicMenuItem => ({
            id: item.id,
            name: item.name,
            namePersian: item.namePersian,
            description: item.descriptionPersian ?? item.description,
            imageUrl: item.imageUrl,
            price: (item.sellingPrice ?? 0).toString(),
            isAvailable:
              item.availability === 'AVAILABLE' && withinWindow(item.availability_),
            isFeatured: item.isFeatured,
            allergens: item.allergens,
            calories: item.calories,
            modifiers: item.modifierGroups
              .filter((g) => Number(g.modifier.priceDelta) > 0)
              .map((g) => ({
                id: g.modifier.id,
                name: g.modifier.namePersian,
                priceDelta: g.modifier.priceDelta.toString(),
              })),
          })),
        };
      })
      .filter((category) => category.items.length > 0),
    generatedAt: now.toISOString(),
  };
}
