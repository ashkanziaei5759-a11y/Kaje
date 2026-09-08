/**
 * Demo data for Kajeh / کاژه.
 *
 * Realistic Iranian restaurant data at 2025-era Tehran prices (Toman), so the
 * app is immediately legible: real dishes, real ingredients, a real sub-recipe
 * tree, and 60 days of sales history so the dashboard, menu engineering and
 * variance reports all have something to show.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { DEFAULT_UNITS } from '../src/lib/units';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/lib/auth/permissions';

const prisma = new PrismaClient();

/** Deterministic PRNG so every seed run produces the same demo history. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
const random = makeRandom(20260908);
const pick = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length)];
const between = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

/** Development-only reset. Never call this against a production database. */
async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log('🍽  Seeding Kajeh / کاژه …');

  // Idempotent: wipe and rebuild.
  //
  // TRUNCATE rather than a cascading delete on Restaurant. The FKs from
  // StockLevel/InventoryTransaction to Branch deliberately do NOT cascade —
  // in production, deleting a branch that still holds stock should fail loudly
  // rather than silently erase its ledger. Resetting demo data is a
  // development concern, so it is handled here instead of by weakening those
  // constraints.
  await resetDatabase();

  // ── Restaurant, branch, warehouse ──────────────────────────────────────────
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Kajeh',
      namePersian: 'کاژه',
      slug: 'kajeh',
      currencyCode: 'IRT',
      currencySymbol: 'تومان',
      locale: 'fa-IR',
      timezone: 'Asia/Tehran',
      calendar: 'jalali',
      phone: '۰۲۱-۸۸۷۷۶۶۵۵',
      address: 'تهران، خیابان ولیعصر، نبش کوچه کاژه، پلاک ۲۴',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Main Branch',
      namePersian: 'شعبه مرکزی',
      code: 'MAIN',
      address: 'تهران، خیابان ولیعصر',
      phone: '۰۲۱-۸۸۷۷۶۶۵۵',
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      branchId: branch.id,
      name: 'Main Store',
      namePersian: 'انبار مرکزی',
      isDefault: true,
    },
  });

  // ── Units ──────────────────────────────────────────────────────────────────
  const units = await Promise.all(
    DEFAULT_UNITS.map((u) =>
      prisma.unitDefinition.create({
        data: {
          restaurantId: restaurant.id,
          code: u.code,
          labelPersian: u.labelPersian,
          dimension: u.dimension,
          factorToBase: String(u.factorToBase),
        },
      }),
    ),
  );
  const U = Object.fromEntries(units.map((u) => [u.code, u.id])) as Record<string, string>;

  // ── Roles & users ──────────────────────────────────────────────────────────
  const roleLabels: Record<string, string> = {
    OWNER: 'مالک',
    MANAGER: 'مدیر',
    ACCOUNTANT: 'حسابدار',
    KITCHEN: 'آشپزخانه',
    WAITER: 'سالن‌دار',
    INVENTORY_MANAGER: 'انباردار',
  };

  const roles: Record<string, string> = {};
  for (const [name, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: name as never },
      update: { permissions, labelPersian: roleLabels[name] },
      create: { name: name as never, labelPersian: roleLabels[name], permissions },
    });
    roles[name] = role.id;
  }

  const password = await bcrypt.hash('Kajeh@1404', 12);
  const owner = await prisma.user.create({
    data: {
      restaurantId: restaurant.id, branchId: branch.id, roleId: roles.OWNER,
      email: 'owner@kajeh.ir', passwordHash: password, name: 'سارا صابری', phone: '۰۹۱۲۱۲۳۴۵۶۷',
    },
  });
  await prisma.user.createMany({
    data: [
      { restaurantId: restaurant.id, branchId: branch.id, roleId: roles.MANAGER,
        email: 'manager@kajeh.ir', passwordHash: password, name: 'رضا کریمی' },
      { restaurantId: restaurant.id, branchId: branch.id, roleId: roles.ACCOUNTANT,
        email: 'accountant@kajeh.ir', passwordHash: password, name: 'مریم احمدی' },
      { restaurantId: restaurant.id, branchId: branch.id, roleId: roles.KITCHEN,
        email: 'kitchen@kajeh.ir', passwordHash: password, name: 'حسن مرادی' },
      { restaurantId: restaurant.id, branchId: branch.id, roleId: roles.INVENTORY_MANAGER,
        email: 'inventory@kajeh.ir', passwordHash: password, name: 'علی رضایی' },
    ],
  });

  // ── Costing profile ────────────────────────────────────────────────────────
  // These are Kajeh's business assumptions — all editable in Settings.
  const profile = await prisma.costingProfile.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Dine-in', namePersian: 'سالن', isDefault: true,
      laborMethod: 'PER_MINUTE',
      laborCostPerMinute: '2000',        // ۲٬۰۰۰ تومان به ازای هر دقیقه
      overheadMethod: 'PER_UNIT',
      monthlyOverheadCost: '300000000',  // ۳۰۰ میلیون تومان سربار ماهانه
      expectedMonthlyUnits: 10000,       // ⇒ ۳۰٬۰۰۰ تومان سربار برای هر پرس
      pricingStrategy: 'TARGET_GROSS_MARGIN',
      targetGrossMargin: '0.35',
      targetFoodCostPct: '0.30',
      targetNetMargin: '0.15',
      minimumMargin: '0.15',
      roundingRule: 'NEAREST_5000',
      taxRate: '0.10',                   // ۱۰٪ مالیات بر ارزش افزوده
      taxInclusive: true,
      wasteBufferPct: '0.02',
    },
  });

  await prisma.costingProfile.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Delivery', namePersian: 'بیرون‌بر', isDefault: false,
      laborMethod: 'PER_MINUTE', laborCostPerMinute: '2000',
      // Delivery carries a heavier overhead share (packaging, courier, platform fee).
      overheadMethod: 'PERCENT_OF_REVENUE', overheadPercentOfRevenue: '0.18',
      pricingStrategy: 'TARGET_GROSS_MARGIN', targetGrossMargin: '0.40',
      minimumMargin: '0.20', roundingRule: 'NEAREST_5000',
      taxRate: '0.10', taxInclusive: true, wasteBufferPct: '0.02',
    },
  });

  const drinksProfile = await prisma.costingProfile.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Drinks', namePersian: 'نوشیدنی', isDefault: false,
      laborMethod: 'PER_MINUTE', laborCostPerMinute: '2000',
      // A flat per-unit overhead share is right for a main course but absurd for
      // a glass of tea — a drink does not occupy the kitchen the way a kebab
      // does. Percentage-of-revenue keeps the allocation proportionate.
      overheadMethod: 'PERCENT_OF_REVENUE', overheadPercentOfRevenue: '0.12',
      pricingStrategy: 'TARGET_GROSS_MARGIN', targetGrossMargin: '0.55',
      minimumMargin: '0.30', roundingRule: 'NEAREST_5000',
      taxRate: '0.10', taxInclusive: true, wasteBufferPct: '0',
    },
  });

  await prisma.setting.createMany({
    data: [
      { restaurantId: restaurant.id, key: 'alerts.priceIncreaseThreshold', value: '0.10',
        description: 'افزایش قیمت بیش از این نسبت هشدار می‌سازد' },
      { restaurantId: restaurant.id, key: 'menu.showCalories', value: false },
      { restaurantId: restaurant.id, key: 'menu.showAllergens', value: true },
      { restaurantId: restaurant.id, key: 'inventory.allowNegativeStock', value: true },
    ],
  });

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const suppliers = await Promise.all([
    { name: 'Tehran Protein', namePersian: 'پروتئین تهران', contactPerson: 'آقای موسوی',
      phone: '۰۹۱۲۳۳۳۴۴۵۵', paymentTerms: 'نقدی', address: 'میدان بهمن، بازار پروتئین' },
    { name: 'Golestan Rice', namePersian: 'برنج گلستان', contactPerson: 'آقای شریفی',
      phone: '۰۹۱۱۴۴۴۵۵۶۶', paymentTerms: '۳۰ روزه', address: 'گرگان، شهرک صنعتی' },
    { name: 'Sabz Bahar', namePersian: 'سبزی و صیفی بهار', contactPerson: 'خانم نوری',
      phone: '۰۹۱۲۵۵۵۶۶۷۷', paymentTerms: 'نقدی', address: 'میدان مرکزی میوه و تره‌بار' },
    { name: 'Pegah Dairy', namePersian: 'لبنیات پگاه', contactPerson: 'آقای حیدری',
      phone: '۰۹۱۲۶۶۶۷۷۸۸', paymentTerms: '۱۵ روزه' },
    { name: 'Kimia Packaging', namePersian: 'بسته‌بندی کیمیا', contactPerson: 'آقای فلاحی',
      phone: '۰۹۱۲۷۷۷۸۸۹۹', paymentTerms: '۳۰ روزه' },
  ].map((s) => prisma.supplier.create({ data: { ...s, restaurantId: restaurant.id } })));

  const [protein, rice, veg, dairy, packaging] = suppliers;

  // ── Ingredients ────────────────────────────────────────────────────────────
  // purchasePrice is per PURCHASE unit; conversionFactor converts to recipe units.
  const ingredientSpecs = [
    // name, fa, category, purchaseUnit, recipeUnit, factor, price/purchaseUnit, yield, min, reorder, supplier
    ['Chicken Breast', 'سینه مرغ', 'POULTRY', 'kg', 'g', 1000, 820_000, 0.85, 5000, 15000, protein],
    ['Lamb Meat', 'گوشت گوسفندی', 'MEAT', 'kg', 'g', 1000, 2_350_000, 0.80, 3000, 8000, protein],
    ['Ground Beef', 'گوشت چرخ‌کرده', 'MEAT', 'kg', 'g', 1000, 1_850_000, 0.95, 3000, 8000, protein],
    ['Basmati Rice', 'برنج ایرانی', 'GRAIN', 'kg', 'g', 1000, 780_000, 1.0, 10000, 30000, rice],
    ['Butter', 'کره', 'DAIRY', 'kg', 'g', 1000, 1_450_000, 1.0, 1000, 3000, dairy],
    ['Saffron', 'زعفران', 'SPICE', 'g', 'g', 1, 145_000, 1.0, 20, 50, veg],
    ['Tomato', 'گوجه فرنگی', 'VEGETABLE', 'kg', 'g', 1000, 165_000, 0.90, 3000, 10000, veg],
    ['Onion', 'پیاز', 'VEGETABLE', 'kg', 'g', 1000, 95_000, 0.85, 5000, 15000, veg],
    ['Potato', 'سیب‌زمینی', 'VEGETABLE', 'kg', 'g', 1000, 88_000, 0.88, 5000, 15000, veg],
    ['Sunflower Oil', 'روغن آفتابگردان', 'OIL', 'l', 'ml', 1000, 420_000, 1.0, 3000, 8000, veg],
    ['Pizza Cheese', 'پنیر پیتزا', 'DAIRY', 'kg', 'g', 1000, 1_980_000, 1.0, 2000, 6000, dairy],
    ['Pizza Dough Flour', 'آرد پیتزا', 'GRAIN', 'kg', 'g', 1000, 320_000, 1.0, 5000, 12000, rice],
    ['Burger Bun', 'نان همبرگر', 'GRAIN', 'piece', 'piece', 1, 22_000, 1.0, 50, 150, rice],
    ['Lavash Bread', 'نان لواش', 'GRAIN', 'piece', 'piece', 1, 8_000, 1.0, 100, 300, rice],
    ['Mayonnaise', 'سس مایونز', 'OTHER', 'kg', 'g', 1000, 380_000, 1.0, 2000, 5000, veg],
    ['Ketchup', 'سس گوجه', 'OTHER', 'kg', 'g', 1000, 290_000, 1.0, 2000, 5000, veg],
    ['Mustard', 'سس خردل', 'OTHER', 'kg', 'g', 1000, 450_000, 1.0, 500, 1500, veg],
    ['Pickle', 'خیارشور', 'VEGETABLE', 'kg', 'g', 1000, 210_000, 0.95, 1000, 3000, veg],
    ['Lettuce', 'کاهو', 'VEGETABLE', 'kg', 'g', 1000, 130_000, 0.75, 1000, 3000, veg],
    ['Yogurt', 'ماست', 'DAIRY', 'kg', 'g', 1000, 195_000, 1.0, 2000, 5000, dairy],
    ['Cucumber', 'خیار', 'VEGETABLE', 'kg', 'g', 1000, 145_000, 0.92, 2000, 5000, veg],
    ['Mint Dried', 'نعناع خشک', 'SPICE', 'kg', 'g', 1000, 890_000, 1.0, 200, 500, veg],
    ['Walnut', 'گردو', 'OTHER', 'kg', 'g', 1000, 2_400_000, 1.0, 500, 1500, veg],
    ['Eggplant', 'بادمجان', 'VEGETABLE', 'kg', 'g', 1000, 155_000, 0.78, 2000, 6000, veg],
    ['Whey/Kashk', 'کشک', 'DAIRY', 'kg', 'g', 1000, 620_000, 1.0, 1000, 2500, dairy],
    ['Cola Can', 'نوشابه قوطی', 'BEVERAGE', 'piece', 'piece', 1, 28_000, 1.0, 50, 200, veg],
    ['Mineral Water', 'آب معدنی', 'BEVERAGE', 'piece', 'piece', 1, 12_000, 1.0, 50, 200, veg],
    ['Doogh Bottle', 'دوغ بطری', 'BEVERAGE', 'piece', 'piece', 1, 35_000, 1.0, 40, 150, dairy],
    ['Tea', 'چای', 'BEVERAGE', 'kg', 'g', 1000, 1_150_000, 1.0, 300, 1000, veg],
    ['Sugar', 'شکر', 'OTHER', 'kg', 'g', 1000, 135_000, 1.0, 2000, 5000, veg],
    ['Saffron Ice Cream Base', 'پایه بستنی زعفرانی', 'DAIRY', 'kg', 'g', 1000, 890_000, 1.0, 1000, 3000, dairy],
    // Packaging — excluded from food cost, reported separately.
    ['Takeaway Box Large', 'ظرف یکبار مصرف بزرگ', 'PACKAGING', 'piece', 'piece', 1, 5_000, 1.0, 100, 400, packaging],
    ['Takeaway Box Small', 'ظرف یکبار مصرف کوچک', 'PACKAGING', 'piece', 'piece', 1, 3_200, 1.0, 100, 400, packaging],
    ['Pizza Box', 'جعبه پیتزا', 'PACKAGING', 'piece', 'piece', 1, 12_000, 1.0, 80, 250, packaging],
    ['Paper Bag', 'پاکت کاغذی', 'PACKAGING', 'piece', 'piece', 1, 2_500, 1.0, 150, 500, packaging],
  ] as const;

  const ing: Record<string, string> = {};
  for (const [name, fa, category, pu, ru, factor, price, yieldPct, min, reorder, supplier] of ingredientSpecs) {
    const created = await prisma.ingredient.create({
      data: {
        restaurantId: restaurant.id,
        name, namePersian: fa,
        category: category as never,
        purchaseUnitId: U[pu], recipeUnitId: U[ru],
        conversionFactor: String(factor),
        yieldPercent: String(yieldPct),
        lastPurchasePrice: String(price),
        averagePrice: String(price),
        lastPurchaseDate: new Date(),
        minimumStock: String(min),
        reorderLevel: String(reorder),
        isPackaging: category === 'PACKAGING',
        defaultSupplierId: (supplier as { id: string }).id,
      },
    });
    ing[name] = created.id;
  }

  // ── Opening stock ──────────────────────────────────────────────────────────
  // Booked through the ledger so the audit trail is complete from day one.
  // Sized to carry ~2 weeks of trading; weekly replenishment purchases below
  // top it up across the 60-day history so stock never goes negative.
  const openingStock: Array<[string, number]> = [
    ['Chicken Breast', 180_000], ['Lamb Meat', 90_000], ['Ground Beef', 120_000],
    ['Basmati Rice', 600_000], ['Butter', 60_000], ['Saffron', 2_500],
    ['Tomato', 160_000], ['Onion', 150_000], ['Potato', 140_000],
    ['Sunflower Oil', 150_000], ['Pizza Cheese', 120_000], ['Pizza Dough Flour', 400_000],
    ['Burger Bun', 1_600], ['Lavash Bread', 2_500], ['Mayonnaise', 90_000],
    ['Ketchup', 70_000], ['Mustard', 25_000], ['Pickle', 60_000], ['Lettuce', 40_000],
    ['Yogurt', 40_000], ['Cucumber', 60_000], ['Mint Dried', 4_000],
    ['Walnut', 15_000], ['Eggplant', 90_000], ['Whey/Kashk', 25_000],
    ['Cola Can', 900], ['Mineral Water', 600], ['Doogh Bottle', 500],
    ['Tea', 6_000], ['Sugar', 25_000], ['Saffron Ice Cream Base', 12_000],
    ['Takeaway Box Large', 2_400], ['Takeaway Box Small', 2_200],
    ['Pizza Box', 900], ['Paper Bag', 1_200],
  ];

  const openedAt = new Date(Date.now() - 65 * 86_400_000);
  for (const [name, quantity] of openingStock) {
    const ingredientId = ing[name];
    const record = ingredientSpecs.find((s) => s[0] === name)!;
    const unitCost = record[6] / record[5]; // price per recipe unit

    await prisma.stockLevel.create({
      data: {
        ingredientId, branchId: branch.id, warehouseId: warehouse.id,
        quantity: String(quantity), avgUnitCost: unitCost.toFixed(8),
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        ingredientId, branchId: branch.id, warehouseId: warehouse.id,
        type: 'PURCHASE_RECEIPT',
        quantity: String(quantity), unitCost: unitCost.toFixed(8),
        totalCost: (quantity * unitCost).toFixed(4),
        balanceAfter: String(quantity),
        reason: 'موجودی اولیه افتتاحیه',
        userId: owner.id, occurredAt: openedAt,
      },
    });
  }

  // ── Recipes: sub-recipes first ─────────────────────────────────────────────
  type Line = { ingredient?: string; sub?: string; quantity: number; unit: string; waste?: number };

  async function makeRecipe(spec: {
    name: string; fa: string; type: 'MENU_ITEM' | 'SUB_RECIPE' | 'BATCH';
    yieldQuantity: number; yieldUnit: string; prep: number; cook: number;
    recipeYield?: number; prepLoss?: number; lines: Line[];
  }): Promise<string> {
    const recipe = await prisma.recipe.create({
      data: {
        restaurantId: restaurant.id,
        name: spec.name, namePersian: spec.fa, type: spec.type,
        yieldQuantity: String(spec.yieldQuantity), yieldUnitId: U[spec.yieldUnit],
        recipeYieldPercent: String(spec.recipeYield ?? 1),
        preparationLossPercent: String(spec.prepLoss ?? 0),
        prepTimeMinutes: spec.prep, cookTimeMinutes: spec.cook,
      },
    });
    await prisma.recipeItem.createMany({
      data: spec.lines.map((l, index) => ({
        recipeId: recipe.id,
        ingredientId: l.ingredient ? ing[l.ingredient] : null,
        subRecipeId: l.sub ?? null,
        quantity: String(l.quantity), unitId: U[l.unit],
        wastePercent: String(l.waste ?? 0), sortOrder: index,
      })),
    });
    return recipe.id;
  }

  // Burger sauce — the spec's nested-recipe example.
  const burgerSauce = await makeRecipe({
    name: 'Burger Sauce', fa: 'سس مخصوص برگر', type: 'BATCH',
    yieldQuantity: 1000, yieldUnit: 'g', prep: 10, cook: 0,
    lines: [
      { ingredient: 'Mayonnaise', quantity: 600, unit: 'g' },
      { ingredient: 'Ketchup', quantity: 250, unit: 'g' },
      { ingredient: 'Mustard', quantity: 80, unit: 'g' },
      { ingredient: 'Pickle', quantity: 70, unit: 'g' },
    ],
  });

  const beefPatty = await makeRecipe({
    name: 'Beef Patty', fa: 'برگر گوشت', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'piece', prep: 6, cook: 0,
    // Grilling drives off moisture: 150 g raw becomes ~120 g cooked.
    recipeYield: 0.8,
    lines: [
      { ingredient: 'Ground Beef', quantity: 150, unit: 'g' },
      { ingredient: 'Onion', quantity: 25, unit: 'g' },
    ],
  });

  const saffronRice = await makeRecipe({
    name: 'Saffron Rice', fa: 'برنج زعفرانی', type: 'SUB_RECIPE',
    yieldQuantity: 1000, yieldUnit: 'g', prep: 8, cook: 25,
    lines: [
      { ingredient: 'Basmati Rice', quantity: 700, unit: 'g' },
      { ingredient: 'Butter', quantity: 40, unit: 'g' },
      { ingredient: 'Saffron', quantity: 0.3, unit: 'g' },
    ],
  });

  const pizzaDough = await makeRecipe({
    name: 'Pizza Dough', fa: 'خمیر پیتزا', type: 'BATCH',
    yieldQuantity: 10, yieldUnit: 'piece', prep: 25, cook: 0,
    lines: [
      { ingredient: 'Pizza Dough Flour', quantity: 2200, unit: 'g' },
      { ingredient: 'Sunflower Oil', quantity: 150, unit: 'ml' },
    ],
  });

  // ── Menu recipes ───────────────────────────────────────────────────────────
  const rChickenKebab = await makeRecipe({
    name: 'Chicken Kebab', fa: 'جوجه کباب', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 8, cook: 7,
    lines: [
      { ingredient: 'Chicken Breast', quantity: 250, unit: 'g' },
      { sub: saffronRice, quantity: 300, unit: 'g' },
      { ingredient: 'Butter', quantity: 15, unit: 'g' },
      { ingredient: 'Saffron', quantity: 0.2, unit: 'g' },
      { ingredient: 'Tomato', quantity: 80, unit: 'g' },
      { ingredient: 'Sunflower Oil', quantity: 20, unit: 'ml' },
      { ingredient: 'Lavash Bread', quantity: 1, unit: 'piece' },
      { ingredient: 'Takeaway Box Large', quantity: 1, unit: 'piece' },
    ],
  });

  const rLambKebab = await makeRecipe({
    name: 'Lamb Kebab Koobideh', fa: 'کباب کوبیده', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 10, cook: 8,
    lines: [
      { ingredient: 'Lamb Meat', quantity: 180, unit: 'g' },
      { ingredient: 'Onion', quantity: 60, unit: 'g' },
      { sub: saffronRice, quantity: 300, unit: 'g' },
      { ingredient: 'Butter', quantity: 15, unit: 'g' },
      { ingredient: 'Tomato', quantity: 80, unit: 'g' },
      { ingredient: 'Lavash Bread', quantity: 1, unit: 'piece' },
      { ingredient: 'Takeaway Box Large', quantity: 1, unit: 'piece' },
    ],
  });

  const rBurger = await makeRecipe({
    name: 'Kajeh Special Burger', fa: 'برگر مخصوص کاژه', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 5, cook: 6,
    lines: [
      { sub: beefPatty, quantity: 1, unit: 'piece' },
      { ingredient: 'Burger Bun', quantity: 1, unit: 'piece' },
      { sub: burgerSauce, quantity: 35, unit: 'g' },
      { ingredient: 'Pizza Cheese', quantity: 30, unit: 'g' },
      { ingredient: 'Lettuce', quantity: 25, unit: 'g' },
      { ingredient: 'Tomato', quantity: 40, unit: 'g' },
      { ingredient: 'Pickle', quantity: 20, unit: 'g' },
      { ingredient: 'Potato', quantity: 150, unit: 'g' },
      { ingredient: 'Sunflower Oil', quantity: 30, unit: 'ml', waste: 0.15 },
      { ingredient: 'Takeaway Box Small', quantity: 1, unit: 'piece' },
    ],
  });

  const rPizza = await makeRecipe({
    name: 'Mixed Pizza', fa: 'پیتزا مخلوط', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 7, cook: 12,
    lines: [
      { sub: pizzaDough, quantity: 1, unit: 'piece' },
      { ingredient: 'Pizza Cheese', quantity: 180, unit: 'g' },
      { ingredient: 'Ground Beef', quantity: 80, unit: 'g' },
      { ingredient: 'Tomato', quantity: 60, unit: 'g' },
      { ingredient: 'Ketchup', quantity: 40, unit: 'g' },
      { ingredient: 'Pizza Box', quantity: 1, unit: 'piece' },
    ],
  });

  const rKashkBademjan = await makeRecipe({
    name: 'Kashk-e Bademjan', fa: 'کشک بادمجان', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 12, cook: 18,
    // Aubergine loses a great deal of water when fried.
    recipeYield: 0.65,
    lines: [
      { ingredient: 'Eggplant', quantity: 300, unit: 'g' },
      { ingredient: 'Whey/Kashk', quantity: 60, unit: 'g' },
      { ingredient: 'Onion', quantity: 50, unit: 'g' },
      { ingredient: 'Walnut', quantity: 15, unit: 'g' },
      { ingredient: 'Mint Dried', quantity: 3, unit: 'g' },
      { ingredient: 'Sunflower Oil', quantity: 40, unit: 'ml' },
      { ingredient: 'Lavash Bread', quantity: 1, unit: 'piece' },
      { ingredient: 'Takeaway Box Small', quantity: 1, unit: 'piece' },
    ],
  });

  const rSalad = await makeRecipe({
    name: 'Shirazi Salad', fa: 'سالاد شیرازی', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 6, cook: 0,
    lines: [
      { ingredient: 'Cucumber', quantity: 100, unit: 'g' },
      { ingredient: 'Tomato', quantity: 100, unit: 'g' },
      { ingredient: 'Onion', quantity: 30, unit: 'g' },
      { ingredient: 'Takeaway Box Small', quantity: 1, unit: 'piece' },
    ],
  });

  const rMastKhiar = await makeRecipe({
    name: 'Mast-o Khiar', fa: 'ماست و خیار', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 5, cook: 0,
    lines: [
      { ingredient: 'Yogurt', quantity: 150, unit: 'g' },
      { ingredient: 'Cucumber', quantity: 60, unit: 'g' },
      { ingredient: 'Mint Dried', quantity: 2, unit: 'g' },
      { ingredient: 'Walnut', quantity: 8, unit: 'g' },
      { ingredient: 'Takeaway Box Small', quantity: 1, unit: 'piece' },
    ],
  });

  const rTea = await makeRecipe({
    name: 'Persian Tea', fa: 'چای ایرانی', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 2, cook: 3,
    lines: [
      { ingredient: 'Tea', quantity: 6, unit: 'g' },
      { ingredient: 'Sugar', quantity: 15, unit: 'g' },
    ],
  });

  const rCola = await makeRecipe({
    name: 'Cola', fa: 'نوشابه', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 1, cook: 0,
    lines: [{ ingredient: 'Cola Can', quantity: 1, unit: 'piece' }],
  });

  const rDoogh = await makeRecipe({
    name: 'Doogh', fa: 'دوغ', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 1, cook: 0,
    lines: [{ ingredient: 'Doogh Bottle', quantity: 1, unit: 'piece' }],
  });

  const rIceCream = await makeRecipe({
    name: 'Saffron Ice Cream', fa: 'بستنی زعفرانی', type: 'MENU_ITEM',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 3, cook: 0,
    lines: [
      { ingredient: 'Saffron Ice Cream Base', quantity: 120, unit: 'g' },
      { ingredient: 'Walnut', quantity: 10, unit: 'g' },
      { ingredient: 'Takeaway Box Small', quantity: 1, unit: 'piece' },
    ],
  });

  // ── Menu categories & items ────────────────────────────────────────────────
  const categorySpecs = [
    ['Appetizers', 'پیش‌غذا', '🥗', 1],
    ['Main Dishes', 'غذای اصلی', '🍢', 2],
    ['Burgers', 'برگر', '🍔', 3],
    ['Pizza', 'پیتزا', '🍕', 4],
    ['Drinks', 'نوشیدنی', '🥤', 5],
    ['Desserts', 'دسر', '🍨', 6],
  ] as const;

  const cat: Record<string, string> = {};
  for (const [name, fa, icon, order] of categorySpecs) {
    const created = await prisma.menuCategory.create({
      data: { restaurantId: restaurant.id, name, namePersian: fa, icon, sortOrder: order },
    });
    cat[name] = created.id;
  }

  const menuSpecs = [
    { name: 'Chicken Kebab', fa: 'جوجه کباب', cat: 'Main Dishes', recipe: rChickenKebab,
      price: 495_000, featured: true,
      desc: 'Marinated chicken breast grilled over charcoal, saffron rice, grilled tomato',
      descFa: 'سینه مرغ مزه‌دار شده با زعفران، کباب شده روی زغال، همراه با برنج زعفرانی و گوجه کبابی',
      allergens: [] as string[] },
    { name: 'Lamb Kebab Koobideh', fa: 'کباب کوبیده', cat: 'Main Dishes', recipe: rLambKebab,
      price: 620_000, featured: true,
      desc: 'Two skewers of seasoned minced lamb with saffron rice',
      descFa: 'دو سیخ کباب کوبیده گوشت گوسفندی با برنج زعفرانی و گوجه کبابی',
      allergens: [] },
    { name: 'Kajeh Special Burger', fa: 'برگر مخصوص کاژه', cat: 'Burgers', recipe: rBurger,
      price: 445_000, featured: true,
      desc: 'House beef patty, special sauce, cheese, fresh vegetables, hand-cut fries',
      descFa: 'برگر دست‌ساز گوشت، سس مخصوص کاژه، پنیر، سبزیجات تازه و سیب‌زمینی سرخ‌کرده',
      allergens: ['گلوتن', 'لبنیات', 'تخم‌مرغ'] },
    { name: 'Mixed Pizza', fa: 'پیتزا مخلوط', cat: 'Pizza', recipe: rPizza,
      price: 520_000, featured: false,
      desc: 'Fresh dough, generous cheese, beef and vegetables',
      descFa: 'خمیر تازه روزانه، پنیر فراوان، گوشت و سبزیجات',
      allergens: ['گلوتن', 'لبنیات'] },
    { name: 'Kashk-e Bademjan', fa: 'کشک بادمجان', cat: 'Appetizers', recipe: rKashkBademjan,
      price: 240_000, featured: false,
      desc: 'Traditional aubergine dip with whey, walnut and dried mint',
      descFa: 'بادمجان سرخ‌شده با کشک، گردو، پیاز داغ و نعناع داغ',
      allergens: ['لبنیات', 'آجیل'] },
    { name: 'Shirazi Salad', fa: 'سالاد شیرازی', cat: 'Appetizers', recipe: rSalad,
      price: 125_000, featured: false,
      desc: 'Diced cucumber, tomato and onion with lime dressing',
      descFa: 'خیار، گوجه و پیاز خردشده با سس آبلیمو و نعناع',
      allergens: [] },
    { name: 'Mast-o Khiar', fa: 'ماست و خیار', cat: 'Appetizers', recipe: rMastKhiar,
      price: 135_000, featured: false,
      desc: 'Yogurt with cucumber, mint and walnut',
      descFa: 'ماست چکیده با خیار، نعناع خشک و گردو',
      allergens: ['لبنیات', 'آجیل'] },
    { name: 'Persian Tea', fa: 'چای ایرانی', cat: 'Drinks', recipe: rTea,
      price: 55_000, featured: false,
      desc: 'Freshly brewed Persian tea', descFa: 'چای تازه دم با نبات', allergens: [] },
    { name: 'Cola', fa: 'نوشابه', cat: 'Drinks', recipe: rCola,
      price: 75_000, featured: false, desc: 'Chilled canned cola', descFa: 'نوشابه قوطی خنک', allergens: [] },
    { name: 'Doogh', fa: 'دوغ', cat: 'Drinks', recipe: rDoogh,
      price: 85_000, featured: false, desc: 'Traditional mint yogurt drink',
      descFa: 'دوغ سنتی با نعناع', allergens: ['لبنیات'] },
    { name: 'Saffron Ice Cream', fa: 'بستنی زعفرانی', cat: 'Desserts', recipe: rIceCream,
      price: 195_000, featured: true, desc: 'Traditional saffron ice cream with pistachio and walnut',
      descFa: 'بستنی سنتی زعفرانی با خامه، پسته و گردو', allergens: ['لبنیات', 'آجیل'] },
  ];

  const menu: Record<string, string> = {};
  for (const [index, m] of menuSpecs.entries()) {
    const created = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id, categoryId: cat[m.cat], recipeId: m.recipe,
        costingProfileId: m.cat === 'Drinks' ? drinksProfile.id : profile.id,
        name: m.name, namePersian: m.fa,
        description: m.desc, descriptionPersian: m.descFa,
        sellingPrice: String(m.price), priceIsOverridden: true,
        isFeatured: m.featured, sortOrder: index,
        allergens: m.allergens,
      },
    });
    menu[m.name] = created.id;
  }

  // ── Modifiers ──────────────────────────────────────────────────────────────
  const rExtraCheese = await makeRecipe({
    name: 'Extra Cheese Portion', fa: 'پنیر اضافه', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 1, cook: 0,
    lines: [{ ingredient: 'Pizza Cheese', quantity: 40, unit: 'g' }],
  });
  const rExtraPatty = await makeRecipe({
    name: 'Extra Patty Portion', fa: 'برگر اضافه', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 3, cook: 0,
    lines: [{ sub: beefPatty, quantity: 1, unit: 'piece' }],
  });
  const rExtraSauce = await makeRecipe({
    name: 'Extra Sauce Portion', fa: 'سس اضافه', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 1, cook: 0,
    lines: [{ sub: burgerSauce, quantity: 30, unit: 'g' }],
  });
  const rOnionPortion = await makeRecipe({
    name: 'Onion Portion', fa: 'پیاز', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 0, cook: 0,
    lines: [{ ingredient: 'Onion', quantity: 25, unit: 'g' }],
  });
  const rTomatoPortion = await makeRecipe({
    name: 'Tomato Portion', fa: 'گوجه', type: 'SUB_RECIPE',
    yieldQuantity: 1, yieldUnit: 'portion', prep: 0, cook: 0,
    lines: [{ ingredient: 'Tomato', quantity: 40, unit: 'g' }],
  });

  const modifierSpecs = [
    ['Extra Cheese', 'پنیر اضافه', 'ADDITION', 50_000, rExtraCheese, 1],
    ['Extra Patty', 'برگر اضافه', 'ADDITION', 120_000, rExtraPatty, 1],
    ['Extra Sauce', 'سس اضافه', 'ADDITION', 20_000, rExtraSauce, 1],
    ['Double Meat', 'دوبل گوشت', 'ADDITION', 150_000, rExtraPatty, 1],
    // Removals carry a negative factor: the ingredient goes back to stock.
    ['No Onion', 'بدون پیاز', 'REMOVAL', 0, rOnionPortion, -1],
    ['No Tomato', 'بدون گوجه', 'REMOVAL', 0, rTomatoPortion, -1],
  ] as const;

  const mod: Record<string, string> = {};
  for (const [name, fa, type, price, recipeId, factor] of modifierSpecs) {
    const created = await prisma.modifier.create({
      data: {
        restaurantId: restaurant.id, name, namePersian: fa,
        type: type as never, priceDelta: String(price),
        recipeId, quantityFactor: String(factor),
      },
    });
    mod[name] = created.id;
  }

  await prisma.menuItemModifier.createMany({
    data: [
      ...['Extra Cheese', 'Extra Patty', 'Extra Sauce', 'Double Meat', 'No Onion', 'No Tomato']
        .map((m, i) => ({ menuItemId: menu['Kajeh Special Burger'], modifierId: mod[m], sortOrder: i })),
      { menuItemId: menu['Mixed Pizza'], modifierId: mod['Extra Cheese'], sortOrder: 0 },
      { menuItemId: menu['Chicken Kebab'], modifierId: mod['No Onion'], sortOrder: 0 },
    ],
  });

  // ── Menu availability windows ──────────────────────────────────────────────
  await prisma.menuAvailability.createMany({
    data: [
      { categoryId: cat['Main Dishes'], startMinute: 12 * 60, endMinute: 23 * 60, label: 'ناهار و شام' },
      { categoryId: cat['Burgers'], startMinute: 12 * 60, endMinute: 23 * 60 + 30, label: 'ناهار و شام' },
      { categoryId: cat['Pizza'], startMinute: 12 * 60, endMinute: 23 * 60 + 30, label: 'ناهار و شام' },
    ],
  });

  // ── Employees ──────────────────────────────────────────────────────────────
  await prisma.employee.createMany({
    data: [
      { restaurantId: restaurant.id, name: 'حسن مرادی', role: 'سرآشپز', department: 'آشپزخانه',
        salaryType: 'MONTHLY', salaryAmount: '45000000', monthlyHours: '208', burdenPercent: '0.23' },
      { restaurantId: restaurant.id, name: 'محمد نجفی', role: 'کمک آشپز', department: 'آشپزخانه',
        salaryType: 'MONTHLY', salaryAmount: '28000000', monthlyHours: '208', burdenPercent: '0.23' },
      { restaurantId: restaurant.id, name: 'زهرا کاظمی', role: 'کمک آشپز', department: 'آشپزخانه',
        salaryType: 'MONTHLY', salaryAmount: '26000000', monthlyHours: '208', burdenPercent: '0.23' },
      { restaurantId: restaurant.id, name: 'امیر قاسمی', role: 'سالن‌دار', department: 'سالن',
        salaryType: 'HOURLY', salaryAmount: '130000', monthlyHours: '180', burdenPercent: '0.23' },
      { restaurantId: restaurant.id, name: 'نگین سلطانی', role: 'صندوقدار', department: 'سالن',
        salaryType: 'MONTHLY', salaryAmount: '24000000', monthlyHours: '208', burdenPercent: '0.23' },
      { restaurantId: restaurant.id, name: 'علی رضایی', role: 'انباردار', department: 'انبار',
        salaryType: 'MONTHLY', salaryAmount: '25000000', monthlyHours: '208', burdenPercent: '0.23' },
    ],
  });

  // ── Expense categories & expenses ──────────────────────────────────────────
  const expenseCategorySpecs = [
    ['Rent', 'اجاره', true, false], ['Electricity', 'برق', true, false],
    ['Gas', 'گاز', true, false], ['Water', 'آب', true, false],
    ['Internet', 'اینترنت', true, false], ['Cleaning', 'نظافت', true, false],
    ['Maintenance', 'تعمیرات', true, false], ['Marketing', 'بازاریابی', true, false],
    ['Accounting', 'حسابداری', true, false], ['Software', 'نرم‌افزار', true, false],
    ['Insurance', 'بیمه', true, false], ['Depreciation', 'استهلاک تجهیزات', true, false],
    ['Salaries', 'حقوق و دستمزد', false, true],
  ] as const;

  const expCat: Record<string, string> = {};
  for (const [name, fa, isOverhead, isLabor] of expenseCategorySpecs) {
    const created = await prisma.expenseCategory.create({
      data: { restaurantId: restaurant.id, name, namePersian: fa, isOverhead, isLabor },
    });
    expCat[name] = created.id;
  }

  const monthlyExpenses: Array<[string, number, 'FIXED' | 'VARIABLE']> = [
    ['Rent', 120_000_000, 'FIXED'], ['Salaries', 210_000_000, 'FIXED'],
    ['Electricity', 18_000_000, 'VARIABLE'], ['Gas', 9_000_000, 'VARIABLE'],
    ['Water', 4_500_000, 'VARIABLE'], ['Internet', 2_800_000, 'FIXED'],
    ['Cleaning', 8_000_000, 'FIXED'], ['Maintenance', 6_500_000, 'VARIABLE'],
    ['Marketing', 15_000_000, 'VARIABLE'], ['Accounting', 7_000_000, 'FIXED'],
    ['Software', 3_500_000, 'FIXED'], ['Insurance', 11_000_000, 'FIXED'],
    ['Depreciation', 14_000_000, 'FIXED'],
  ];

  for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo, 5);
    for (const [category, amount, type] of monthlyExpenses) {
      await prisma.expense.create({
        data: {
          restaurantId: restaurant.id, branchId: branch.id,
          categoryId: expCat[category],
          amount: String(Math.round(amount * (0.94 + random() * 0.12))),
          type, expenseDate: date, isRecurring: true, recurrenceInterval: 'MONTHLY',
          description: `هزینه ماهانه ${category}`, createdById: owner.id,
        },
      });
    }
  }

  // ── Purchase history (approved through the real service path) ──────────────
  const { approvePurchase } = await import('../src/server/services/purchasing');

  const purchasePlans: Array<{ supplier: string; daysAgo: number; lines: Array<[string, number, string, number]> }> = [
    { supplier: protein.id, daysAgo: 40, lines: [
      ['Chicken Breast', 120, 'kg', 838_000], ['Lamb Meat', 45, 'kg', 2_380_000],
      ['Ground Beef', 60, 'kg', 1_875_000]] },
    { supplier: rice.id, daysAgo: 38, lines: [
      ['Basmati Rice', 100, 'kg', 750_000], ['Burger Bun', 300, 'piece', 21_000],
      ['Lavash Bread', 600, 'piece', 7_500]] },
    { supplier: veg.id, daysAgo: 30, lines: [
      ['Tomato', 30, 'kg', 150_000], ['Onion', 50, 'kg', 88_000],
      ['Potato', 40, 'kg', 82_000], ['Cucumber', 15, 'kg', 138_000]] },
    { supplier: protein.id, daysAgo: 22, lines: [
      // A ~13% jump — this trips the price-increase alert.
      ['Chicken Breast', 130, 'kg', 946_000], ['Ground Beef', 65, 'kg', 1_930_000]] },
    { supplier: dairy.id, daysAgo: 18, lines: [
      ['Pizza Cheese', 20, 'kg', 1_920_000], ['Butter', 8, 'kg', 1_400_000],
      ['Yogurt', 15, 'kg', 190_000]] },
    { supplier: veg.id, daysAgo: 12, lines: [
      ['Tomato', 35, 'kg', 172_000], ['Onion', 45, 'kg', 96_000],
      ['Eggplant', 18, 'kg', 158_000]] },
    { supplier: packaging.id, daysAgo: 9, lines: [
      ['Takeaway Box Large', 500, 'piece', 4_900], ['Takeaway Box Small', 500, 'piece', 3_100],
      ['Pizza Box', 200, 'piece', 11_800]] },
    { supplier: protein.id, daysAgo: 4, lines: [
      ['Chicken Breast', 140, 'kg', 1_010_000], ['Lamb Meat', 50, 'kg', 2_520_000]] },
  ];

  // Weekly replenishment across the 60-day window, so the stock ledger reflects
  // a real trading rhythm rather than a handful of one-off deliveries.
  const replenishment: Array<[string, number, string, number]> = [
    ['Chicken Breast', 55, 'kg', 880_000], ['Lamb Meat', 22, 'kg', 2_420_000],
    ['Ground Beef', 30, 'kg', 1_890_000], ['Basmati Rice', 150, 'kg', 790_000],
    ['Pizza Cheese', 28, 'kg', 1_950_000], ['Pizza Dough Flour', 90, 'kg', 325_000],
    ['Tomato', 40, 'kg', 168_000], ['Onion', 35, 'kg', 92_000],
    ['Potato', 35, 'kg', 86_000], ['Sunflower Oil', 35, 'l', 428_000],
    ['Burger Bun', 400, 'piece', 22_000], ['Lavash Bread', 600, 'piece', 8_200],
    ['Mayonnaise', 22, 'kg', 385_000], ['Ketchup', 18, 'kg', 295_000],
    ['Mustard', 6, 'kg', 455_000], ['Butter', 12, 'kg', 1_465_000],
    ['Pickle', 10, 'kg', 213_000], ['Lettuce', 8, 'kg', 132_000],
    ['Eggplant', 20, 'kg', 156_000], ['Cucumber', 15, 'kg', 147_000],
    ['Takeaway Box Large', 600, 'piece', 5_000],
    ['Takeaway Box Small', 550, 'piece', 3_200],
    ['Pizza Box', 220, 'piece', 12_000],
  ];
  for (let week = 8; week >= 1; week--) {
    // Prices drift up ~1.5% a week — this is what makes the price-history chart
    // and the recipe-cost-increase alerts show something real.
    const drift = 1 + (8 - week) * 0.015;
    purchasePlans.push({
      supplier: protein.id,
      daysAgo: week * 7,
      lines: replenishment.map(([name, quantity, unit, price]) =>
        [name, quantity, unit, Math.round(price * drift)] as [string, number, string, number],
      ),
    });
  }

  for (const [index, plan] of purchasePlans.entries()) {
    const purchaseDate = new Date(Date.now() - plan.daysAgo * 86_400_000);
    let subtotal = 0;
    const items = plan.lines.map(([name, quantity, unit, unitPrice]) => {
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;
      return {
        ingredientId: ing[name], quantity: String(quantity), unitId: U[unit],
        unitPrice: String(unitPrice), lineTotal: String(lineTotal),
      };
    });

    const purchase = await prisma.purchase.create({
      data: {
        restaurantId: restaurant.id, branchId: branch.id, supplierId: plan.supplier,
        invoiceNumber: `INV-1404-${String(index + 1).padStart(4, '0')}`,
        purchaseDate, status: 'DRAFT',
        subtotal: String(subtotal), totalAmount: String(subtotal),
        createdById: owner.id,
        items: { create: items },
      },
    });

    await approvePurchase({
      purchaseId: purchase.id, restaurantId: restaurant.id,
      userId: owner.id, warehouseId: warehouse.id,
    });
  }

  // ── Waste records ──────────────────────────────────────────────────────────
  const wasteReasons = ['SPOILAGE', 'EXPIRED', 'BURNED', 'PREPARATION', 'OVERPRODUCTION', 'DAMAGED'] as const;
  const wasteCandidates = ['Chicken Breast', 'Tomato', 'Lettuce', 'Basmati Rice', 'Pizza Cheese', 'Eggplant'];

  for (let i = 0; i < 22; i++) {
    const name = pick(wasteCandidates);
    const ingredientId = ing[name];
    const level = await prisma.stockLevel.findFirst({ where: { ingredientId, warehouseId: warehouse.id } });
    const unitCost = Number(level?.avgUnitCost ?? 0);
    const quantity = between(200, 1800);
    const occurredAt = new Date(Date.now() - between(1, 45) * 86_400_000);

    await prisma.waste.create({
      data: {
        restaurantId: restaurant.id, branchId: branch.id, ingredientId,
        quantity: String(quantity), unitCost: unitCost.toFixed(8),
        totalCost: (quantity * unitCost).toFixed(4),
        reason: pick([...wasteReasons]), userId: owner.id, occurredAt,
        notes: 'ثبت شده توسط آشپزخانه',
      },
    });
  }

  // ── Price the menu from the cost engine ───────────────────────────────────
  //
  // Rather than inventing selling prices, run the engine and take its
  // recommendation. That way the demo genuinely demonstrates the costing chain,
  // and every margin shown in the UI is one the system actually derived.
  //
  // Two items are then pinned BELOW their recommendation on purpose: a real
  // menu always contains a loss-leader and an item whose price has not kept up
  // with ingredient inflation, and the menu-engineering and alert screens have
  // nothing to show without them.
  {
    const { costAllMenuItems } = await import('../src/server/services/costing');
    const costed = await costAllMenuItems(restaurant.id);
    // Expressed as a fraction of the recommendation so they stay meaningfully
    // thin — rather than absurd — however ingredient prices drift.
    const pinnedFraction: Record<string, number> = {
      'Chicken Kebab': 0.86,          // a popular draw priced to compete (PLOWHORSE)
      'Lamb Kebab Koobideh': 0.78,    // price has not kept up with lamb inflation
    };

    for (const item of costed) {
      const fraction = pinnedFraction[item.name];
      const price = fraction
        ? Math.round((Number(item.recommendedPrice) * fraction) / 5000) * 5000
        : Number(item.recommendedPrice);
      await prisma.menuItem.update({
        where: { id: item.menuItemId },
        data: { sellingPrice: String(price), priceIsOverridden: fraction !== undefined },
      });
    }
  }

  // ── 60 days of sales ───────────────────────────────────────────────────────
  const { confirmOrder } = await import('../src/server/services/sales');

  // Relative popularity — drives the menu-engineering quadrants.
  const salesMix: Array<[string, number]> = [
    ['Chicken Kebab', 26], ['Lamb Kebab Koobideh', 18], ['Kajeh Special Burger', 20],
    ['Mixed Pizza', 12], ['Kashk-e Bademjan', 6], ['Shirazi Salad', 5],
    ['Mast-o Khiar', 4], ['Persian Tea', 4], ['Cola', 3], ['Doogh', 1],
    ['Saffron Ice Cream', 1],
  ];
  const weightedMenu: string[] = [];
  for (const [name, weight] of salesMix) {
    for (let i = 0; i < weight; i++) weightedMenu.push(name);
  }

  // Read the prices back from the database. Using the placeholder figures the
  // items were created with would price 60 days of history against costs that
  // no longer exist, and every margin in the reports would be fiction.
  const pricedItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id },
    select: { name: true, sellingPrice: true },
  });
  const priceByItem = new Map(pricedItems.map((m) => [m.name, Number(m.sellingPrice)]));
  const modifierPrices: Record<string, number> = {
    'Extra Cheese': 50_000, 'Extra Patty': 120_000, 'Extra Sauce': 20_000,
    'Double Meat': 150_000, 'No Onion': 0, 'No Tomato': 0,
  };

  let orderCounter = 1;
  console.log('   generating 60 days of sales …');

  for (let daysAgo = 59; daysAgo >= 0; daysAgo--) {
    // Thursday/Friday are the Iranian weekend — busier.
    const day = new Date(Date.now() - daysAgo * 86_400_000);
    const isWeekend = day.getDay() === 4 || day.getDay() === 5;
    const orderCount = isWeekend ? between(14, 22) : between(7, 14);

    for (let o = 0; o < orderCount; o++) {
      const placedAt = new Date(day);
      placedAt.setHours(between(12, 22), between(0, 59), 0, 0);

      const lineCount = between(1, 4);
      const chosen = new Map<string, number>();
      for (let l = 0; l < lineCount; l++) {
        const name = pick(weightedMenu);
        chosen.set(name, (chosen.get(name) ?? 0) + between(1, 2));
      }

      let subtotal = 0;
      const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const [name, quantity] of chosen) {
        const unitPrice = priceByItem.get(name)!;
        const modifiers: Prisma.OrderModifierCreateWithoutOrderItemInput[] = [];
        let modifierPrice = 0;

        // Roughly a third of burgers get an extra.
        if (name === 'Kajeh Special Burger' && random() < 0.35) {
          const modName = pick(['Extra Cheese', 'Extra Patty', 'Extra Sauce', 'No Onion']);
          modifierPrice = modifierPrices[modName];
          modifiers.push({
            modifier: { connect: { id: mod[modName] } },
            quantity: 1, priceDelta: String(modifierPrice), costDelta: '0',
          });
        }

        const lineTotal = (unitPrice + modifierPrice) * quantity;
        subtotal += lineTotal;
        orderItems.push({
          menuItem: { connect: { id: menu[name] } },
          quantity, unitPrice: String(unitPrice + modifierPrice),
          lineTotal: String(lineTotal),
          ...(modifiers.length ? { modifiers: { create: modifiers } } : {}),
        });
      }

      const order = await prisma.order.create({
        data: {
          restaurantId: restaurant.id, branchId: branch.id,
          orderNumber: `KJ-${String(orderCounter++).padStart(5, '0')}`,
          status: 'DRAFT',
          channel: pick(['DINE_IN', 'DINE_IN', 'DINE_IN', 'TAKEAWAY', 'DELIVERY']) as never,
          subtotal: String(subtotal), totalAmount: String(subtotal),
          tableNumber: String(between(1, 18)),
          placedAt,
          items: { create: orderItems },
        },
      });

      // Route through the real service so depletion and snapshots are genuine.
      await confirmOrder({
        orderId: order.id, restaurantId: restaurant.id,
        userId: owner.id, warehouseId: warehouse.id,
      });
    }
  }

  // ── QR code ────────────────────────────────────────────────────────────────
  await prisma.qRCode.create({
    data: {
      restaurantId: restaurant.id,
      label: 'منوی دیجیتال کاژه',
      token: randomBytes(16).toString('hex'),
      targetPath: '/menu',
    },
  });

  // ── Recipe versions ────────────────────────────────────────────────────────
  const { createRecipeVersion } = await import('../src/server/services/costing');
  for (const recipeId of [rChickenKebab, rBurger, rPizza]) {
    await createRecipeVersion(restaurant.id, recipeId, owner.id, 'نسخه اولیه ثبت‌شده هنگام راه‌اندازی سیستم');
  }

  // ── Refresh availability & report ──────────────────────────────────────────
  const { refreshAutoAvailability } = await import('../src/server/services/costing');
  const availability = await refreshAutoAvailability(restaurant.id);

  const counts = {
    ingredients: await prisma.ingredient.count({ where: { restaurantId: restaurant.id } }),
    recipes: await prisma.recipe.count({ where: { restaurantId: restaurant.id } }),
    menuItems: await prisma.menuItem.count({ where: { restaurantId: restaurant.id } }),
    orders: await prisma.order.count({ where: { restaurantId: restaurant.id } }),
    movements: await prisma.inventoryTransaction.count({ where: { ingredient: { restaurantId: restaurant.id } } }),
    snapshots: await prisma.costSnapshot.count({ where: { menuItem: { restaurantId: restaurant.id } } }),
    alerts: await prisma.alert.count({ where: { restaurantId: restaurant.id } }),
  };

  console.log('\n✅ Kajeh seeded');
  console.table(counts);
  if (availability.soldOut.length) {
    console.log(`   ${availability.soldOut.length} item(s) auto-marked sold out from stock levels`);
  }
  console.log('\n   Sign in at /login');
  console.log('   owner@kajeh.ir      / Kajeh@1404   (مالک — full access)');
  console.log('   manager@kajeh.ir    / Kajeh@1404   (مدیر)');
  console.log('   accountant@kajeh.ir / Kajeh@1404   (حسابدار)');
  console.log('   kitchen@kajeh.ir    / Kajeh@1404   (آشپزخانه)');
  console.log('   inventory@kajeh.ir  / Kajeh@1404   (انباردار)\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
