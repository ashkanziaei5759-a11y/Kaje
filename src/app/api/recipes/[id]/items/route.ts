import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { loadEngineContext } from '@/server/services/context';
import { costRecipe, CostEngineError } from '@/lib/engine/cost-engine';
import { createRecipeVersion } from '@/server/services/costing';
import { writeAudit } from '@/server/services/audit';

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'عدد معتبر نیست');

const lineSchema = z.object({
  ingredientId: z.string().nullable().optional(),
  subRecipeId: z.string().nullable().optional(),
  quantity: decimalString,
  unitId: z.string().min(1),
  wastePercent: decimalString.optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine(
  (l) => Boolean(l.ingredientId) !== Boolean(l.subRecipeId),
  { message: 'هر خط باید دقیقاً یک ماده اولیه یا یک دستور میانی داشته باشد' },
);

const schema = z.object({
  items: z.array(lineSchema).max(80),
  changeNote: z.string().max(500).optional(),
});

/**
 * Replaces a recipe's whole bill of materials.
 *
 * Whole-list replacement rather than per-line patching: the editor works on the
 * BOM as one document, and a partial apply could leave a recipe half-updated,
 * which silently changes the cost of every dish above it.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.RECIPE_WRITE);
    const { id } = await context.params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'خطوط دستور پخت معتبر نیستند', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { items: true },
    });
    if (!recipe) return NextResponse.json({ error: 'دستور پخت یافت نشد' }, { status: 404 });

    // A recipe cannot contain itself. The database enforces the direct case;
    // this catches it before the write so the message is useful.
    if (parsed.data.items.some((l) => l.subRecipeId === id)) {
      return NextResponse.json(
        { error: 'یک دستور پخت نمی‌تواند خودش را در خود داشته باشد' },
        { status: 400 },
      );
    }

    // Every referenced ingredient, sub-recipe and unit must belong to this
    // restaurant — otherwise a crafted request could pull another tenant's data
    // into this recipe.
    const [ingredientIds, subRecipeIds, unitIds] = [
      parsed.data.items.map((l) => l.ingredientId).filter(Boolean) as string[],
      parsed.data.items.map((l) => l.subRecipeId).filter(Boolean) as string[],
      [...new Set(parsed.data.items.map((l) => l.unitId))],
    ];
    const [validIngredients, validRecipes, validUnits] = await Promise.all([
      prisma.ingredient.count({ where: { id: { in: ingredientIds }, restaurantId: user.restaurantId } }),
      prisma.recipe.count({ where: { id: { in: subRecipeIds }, restaurantId: user.restaurantId } }),
      prisma.unitDefinition.count({ where: { id: { in: unitIds }, restaurantId: user.restaurantId } }),
    ]);
    if (
      validIngredients !== new Set(ingredientIds).size ||
      validRecipes !== new Set(subRecipeIds).size ||
      validUnits !== unitIds.length
    ) {
      return NextResponse.json(
        { error: 'یکی از موارد انتخاب‌شده متعلق به این رستوران نیست' },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { recipeId: id } });
      if (parsed.data.items.length > 0) {
        await tx.recipeItem.createMany({
          data: parsed.data.items.map((line, index) => ({
            recipeId: id,
            ingredientId: line.ingredientId ?? null,
            subRecipeId: line.subRecipeId ?? null,
            quantity: line.quantity,
            unitId: line.unitId,
            wastePercent: line.wastePercent ?? '0',
            notes: line.notes ?? null,
            sortOrder: index,
          })),
        });
      }
    });

    // Cost the saved recipe. A cycle introduced through a chain of sub-recipes
    // only shows up here — if it does, roll the BOM back rather than leaving a
    // recipe that cannot be costed.
    try {
      const ctx = await loadEngineContext(user.restaurantId);
      costRecipe(id, ctx);
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({ where: { recipeId: id } });
        await tx.recipeItem.createMany({
          data: recipe.items.map((line) => ({
            recipeId: id,
            ingredientId: line.ingredientId,
            subRecipeId: line.subRecipeId,
            quantity: line.quantity,
            unitId: line.unitId,
            wastePercent: line.wastePercent,
            yieldPercentOverride: line.yieldPercentOverride,
            isOptional: line.isOptional,
            notes: line.notes,
            sortOrder: line.sortOrder,
          })),
        });
      });
      return NextResponse.json(
        {
          error: error instanceof CostEngineError
            ? error.message
            : 'دستور پخت پس از تغییر قابل محاسبه نبود؛ تغییرات برگردانده شد',
        },
        { status: 422 },
      );
    }

    // Snapshot the new version so historical profitability stays explicable.
    const version = await createRecipeVersion(
      user.restaurantId, id, user.userId,
      parsed.data.changeNote ?? 'ویرایش از پنل مدیریت',
    );

    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'Recipe', entityId: id, action: 'UPDATE',
      before: { lineCount: recipe.items.length },
      after: { lineCount: parsed.data.items.length, version },
    });

    return NextResponse.json({ ok: true, version });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update recipe items:', error);
    return NextResponse.json({ error: 'ذخیره دستور پخت انجام نشد' }, { status: 500 });
  }
}
