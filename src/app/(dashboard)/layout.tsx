import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { hasAnyPermission, PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { NavLink } from '@/components/NavLink';
import { UserMenu } from '@/components/UserMenu';

interface NavItem {
  href: string;
  label: string;
  permissions: Permission[];
}

interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'مرور',
    items: [
      { href: '/dashboard', label: 'داشبورد', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
      { href: '/reports', label: 'گزارش‌ها', permissions: [PERMISSIONS.REPORT_VIEW] },
      { href: '/menu-engineering', label: 'مهندسی منو', permissions: [PERMISSIONS.REPORT_VIEW] },
    ],
  },
  {
    title: 'قیمت تمام‌شده',
    items: [
      { href: '/menu-items', label: 'آیتم‌های منو', permissions: [PERMISSIONS.MENU_READ] },
      { href: '/recipes', label: 'دستور پخت', permissions: [PERMISSIONS.RECIPE_READ] },
      { href: '/costing', label: 'موتور قیمت‌گذاری', permissions: [PERMISSIONS.COST_VIEW] },
    ],
  },
  {
    title: 'انبار و خرید',
    items: [
      { href: '/ingredients', label: 'مواد اولیه', permissions: [PERMISSIONS.INGREDIENT_READ] },
      { href: '/inventory', label: 'موجودی', permissions: [PERMISSIONS.INVENTORY_READ] },
      { href: '/purchases', label: 'خریدها', permissions: [PERMISSIONS.PURCHASE_READ] },
      { href: '/suppliers', label: 'تأمین‌کنندگان', permissions: [PERMISSIONS.SUPPLIER_READ] },
      { href: '/waste', label: 'ضایعات', permissions: [PERMISSIONS.WASTE_READ] },
    ],
  },
  {
    title: 'هزینه‌ها',
    items: [
      { href: '/expenses', label: 'هزینه‌ها', permissions: [PERMISSIONS.EXPENSE_READ] },
      { href: '/employees', label: 'کارکنان', permissions: [PERMISSIONS.EMPLOYEE_READ] },
    ],
  },
  {
    title: 'منوی مشتری',
    items: [
      { href: '/digital-menu', label: 'منوی دیجیتال و QR', permissions: [PERMISSIONS.MENU_READ] },
      { href: '/settings', label: 'تنظیمات', permissions: [PERMISSIONS.SETTINGS_READ] },
    ],
  },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [restaurant, unreadAlerts] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.alert.count({ where: { restaurantId: user.restaurantId, isRead: false } }),
  ]);

  // Hide what the signed-in role cannot open, rather than showing a link that
  // dead-ends in a permission error.
  const groups = NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAnyPermission(user.permissions, item.permissions)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-l border-white/60 bg-white/[0.55] backdrop-blur-glass lg:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-2.5 border-b border-white/60 px-5">
          <span className="grid size-8 place-items-center rounded-lg bg-forest-500 text-ink-50 font-extrabold">
            ک
          </span>
          <div className="leading-none">
            <p className="text-sm font-bold text-ink-900">{restaurant?.namePersian ?? 'کاژه'}</p>
            <p className="mt-1 text-2xs text-ink-600 tracking-widest">KAJEH</p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="label px-2 mb-1.5">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/60 p-3">
          <UserMenu name={user.name} role={user.role} />
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-white/60 bg-white/[0.45] px-4 backdrop-blur-glass sm:px-6">
          <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-forest-500 text-ink-50 font-extrabold">ک</span>
            <span className="font-bold">کاژه</span>
          </Link>

          <div className="hidden lg:block text-sm text-ink-600">
            {restaurant?.address}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/alerts"
              className="relative rounded-lg bg-ink-0 border border-ink-200 px-3 py-1.5 text-2xs text-ink-600 hover:border-ink-300 transition-colors"
            >
              هشدارها
              {unreadAlerts > 0 && (
                <span className="absolute -top-1.5 -left-1.5 grid min-w-5 h-5 place-items-center rounded-full bg-forest-500 px-1 text-2xs font-bold text-ink-50 tabular">
                  {unreadAlerts.toLocaleString('fa-IR')}
                </span>
              )}
            </Link>
            <Link href="/menu" target="_blank" className="btn-ghost text-2xs py-1.5">
              مشاهده منو
            </Link>
          </div>
        </header>

        {/* Mobile navigation — the sidebar collapses to a scrolling rail. */}
        <nav className="overflow-x-auto border-b border-white/60 bg-white/[0.45] backdrop-blur-glass lg:hidden">
          <ul className="flex gap-1 p-2 min-w-max">
            {groups.flatMap((g) => g.items).map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} compact />
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 p-4 sm:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
