/**
 * Permission catalogue.
 *
 * Roles are seeded with a default permission set, but the set is stored as data
 * on the Role row — an owner can re-scope any role without a deploy.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  INGREDIENT_READ: 'ingredient.read',
  INGREDIENT_WRITE: 'ingredient.write',
  INGREDIENT_DELETE: 'ingredient.delete',

  SUPPLIER_READ: 'supplier.read',
  SUPPLIER_WRITE: 'supplier.write',

  PURCHASE_READ: 'purchase.read',
  PURCHASE_WRITE: 'purchase.write',
  PURCHASE_APPROVE: 'purchase.approve',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_COUNT: 'inventory.count',

  WASTE_READ: 'waste.read',
  WASTE_WRITE: 'waste.write',

  RECIPE_READ: 'recipe.read',
  RECIPE_WRITE: 'recipe.write',

  MENU_READ: 'menu.read',
  MENU_WRITE: 'menu.write',
  MENU_PRICE_WRITE: 'menu.price.write',

  COST_VIEW: 'cost.view',
  COST_CONFIGURE: 'cost.configure',

  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_WRITE: 'employee.write',

  EXPENSE_READ: 'expense.read',
  EXPENSE_WRITE: 'expense.write',

  ORDER_READ: 'order.read',
  ORDER_WRITE: 'order.write',

  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',

  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',

  USER_MANAGE: 'user.manage',
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS) as Permission[];

/** Wildcard granted to OWNER — survives the addition of new permissions. */
export const WILDCARD = '*';

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [WILDCARD],

  MANAGER: ALL.filter(
    (p) => !([PERMISSIONS.USER_MANAGE, PERMISSIONS.SETTINGS_WRITE] as string[]).includes(p),
  ),

  ACCOUNTANT: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INGREDIENT_READ,
    PERMISSIONS.SUPPLIER_READ, PERMISSIONS.SUPPLIER_WRITE,
    PERMISSIONS.PURCHASE_READ, PERMISSIONS.PURCHASE_WRITE, PERMISSIONS.PURCHASE_APPROVE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.EXPENSE_READ, PERMISSIONS.EXPENSE_WRITE,
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.COST_VIEW,
    PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.AUDIT_VIEW,
  ],

  KITCHEN: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RECIPE_READ,
    PERMISSIONS.INGREDIENT_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WASTE_READ, PERMISSIONS.WASTE_WRITE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.ORDER_READ,
  ],

  WAITER: [
    PERMISSIONS.MENU_READ,
    PERMISSIONS.ORDER_READ, PERMISSIONS.ORDER_WRITE,
  ],

  INVENTORY_MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INGREDIENT_READ, PERMISSIONS.INGREDIENT_WRITE,
    PERMISSIONS.SUPPLIER_READ, PERMISSIONS.SUPPLIER_WRITE,
    PERMISSIONS.PURCHASE_READ, PERMISSIONS.PURCHASE_WRITE, PERMISSIONS.PURCHASE_APPROVE,
    PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_COUNT,
    PERMISSIONS.WASTE_READ, PERMISSIONS.WASTE_WRITE,
    PERMISSIONS.RECIPE_READ,
    PERMISSIONS.REPORT_VIEW,
  ],
};

export function hasPermission(granted: string[], required: Permission | Permission[]): boolean {
  if (granted.includes(WILDCARD)) return true;
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((p) => granted.includes(p));
}

/** True if the user holds ANY of the listed permissions. */
export function hasAnyPermission(granted: string[], required: Permission[]): boolean {
  if (granted.includes(WILDCARD)) return true;
  return required.some((p) => granted.includes(p));
}
