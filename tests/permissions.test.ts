import { describe, it, expect } from 'vitest';
import {
  hasPermission, hasAnyPermission, PERMISSIONS, WILDCARD,
  DEFAULT_ROLE_PERMISSIONS,
} from '../src/lib/auth/permissions';

describe('permission checks', () => {
  it('grants everything to the wildcard holder', () => {
    expect(hasPermission([WILDCARD], PERMISSIONS.SETTINGS_WRITE)).toBe(true);
    expect(hasPermission([WILDCARD], PERMISSIONS.USER_MANAGE)).toBe(true);
  });

  it('requires every permission when several are demanded', () => {
    const granted = [PERMISSIONS.MENU_READ, PERMISSIONS.RECIPE_READ];
    expect(hasPermission(granted, [PERMISSIONS.MENU_READ, PERMISSIONS.RECIPE_READ])).toBe(true);
    expect(hasPermission(granted, [PERMISSIONS.MENU_READ, PERMISSIONS.MENU_WRITE])).toBe(false);
  });

  it('requires only one when any will do', () => {
    const granted = [PERMISSIONS.MENU_READ];
    expect(hasAnyPermission(granted, [PERMISSIONS.MENU_READ, PERMISSIONS.MENU_WRITE])).toBe(true);
    expect(hasAnyPermission(granted, [PERMISSIONS.EXPENSE_READ])).toBe(false);
  });

  it('denies on an empty grant', () => {
    expect(hasPermission([], PERMISSIONS.MENU_READ)).toBe(false);
    expect(hasAnyPermission([], [PERMISSIONS.MENU_READ])).toBe(false);
  });
});

describe('default role scopes', () => {
  it('gives the owner a wildcard that survives new permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER).toEqual([WILDCARD]);
  });

  it('keeps a waiter away from costs, purchasing and inventory', () => {
    const waiter = DEFAULT_ROLE_PERMISSIONS.WAITER;
    expect(hasPermission(waiter, PERMISSIONS.COST_VIEW)).toBe(false);
    expect(hasPermission(waiter, PERMISSIONS.PURCHASE_APPROVE)).toBe(false);
    expect(hasPermission(waiter, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
    expect(hasPermission(waiter, PERMISSIONS.MENU_PRICE_WRITE)).toBe(false);
    // But can do the job: read the menu and take orders.
    expect(hasPermission(waiter, PERMISSIONS.MENU_READ)).toBe(true);
    expect(hasPermission(waiter, PERMISSIONS.ORDER_WRITE)).toBe(true);
  });

  it('lets the kitchen record waste but not change prices', () => {
    const kitchen = DEFAULT_ROLE_PERMISSIONS.KITCHEN;
    expect(hasPermission(kitchen, PERMISSIONS.WASTE_WRITE)).toBe(true);
    expect(hasPermission(kitchen, PERMISSIONS.RECIPE_READ)).toBe(true);
    expect(hasPermission(kitchen, PERMISSIONS.MENU_PRICE_WRITE)).toBe(false);
    expect(hasPermission(kitchen, PERMISSIONS.RECIPE_WRITE)).toBe(false);
  });

  it('lets the accountant approve purchases but not rewrite recipes', () => {
    const accountant = DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT;
    expect(hasPermission(accountant, PERMISSIONS.PURCHASE_APPROVE)).toBe(true);
    expect(hasPermission(accountant, PERMISSIONS.REPORT_EXPORT)).toBe(true);
    expect(hasPermission(accountant, PERMISSIONS.RECIPE_WRITE)).toBe(false);
    expect(hasPermission(accountant, PERMISSIONS.MENU_PRICE_WRITE)).toBe(false);
  });

  it('withholds user management and settings from the manager', () => {
    const manager = DEFAULT_ROLE_PERMISSIONS.MANAGER;
    expect(hasPermission(manager, PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(hasPermission(manager, PERMISSIONS.SETTINGS_WRITE)).toBe(false);
    // Everything operational is still available.
    expect(hasPermission(manager, PERMISSIONS.MENU_PRICE_WRITE)).toBe(true);
    expect(hasPermission(manager, PERMISSIONS.COST_CONFIGURE)).toBe(true);
  });

  it('never hands the wildcard to a non-owner role', () => {
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === 'OWNER') continue;
      expect(permissions).not.toContain(WILDCARD);
    }
  });
});
