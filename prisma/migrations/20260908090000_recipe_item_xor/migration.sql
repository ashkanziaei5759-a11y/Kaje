-- A BOM line is either an ingredient or a sub-recipe, never both and never
-- neither. The application enforces this too, but a row that violates it would
-- silently drop cost from every dish above it, so the database is the backstop.
ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_ingredient_xor_subrecipe"
  CHECK (
    ("ingredientId" IS NOT NULL AND "subRecipeId" IS NULL)
    OR
    ("ingredientId" IS NULL AND "subRecipeId" IS NOT NULL)
  );

-- A recipe cannot be its own component.
ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_no_self_reference"
  CHECK ("subRecipeId" IS NULL OR "subRecipeId" <> "recipeId");

-- Yield fractions must stay inside the ranges the cost engine assumes;
-- a zero or negative yield would make the engine divide by zero.
ALTER TABLE "Ingredient"
  ADD CONSTRAINT "Ingredient_yield_range"
  CHECK ("yieldPercent" > 0 AND "yieldPercent" <= 1);

ALTER TABLE "Ingredient"
  ADD CONSTRAINT "Ingredient_conversion_positive"
  CHECK ("conversionFactor" > 0);

ALTER TABLE "Recipe"
  ADD CONSTRAINT "Recipe_yield_range"
  CHECK (
    "recipeYieldPercent" > 0 AND "recipeYieldPercent" <= 1
    AND "preparationLossPercent" >= 0 AND "preparationLossPercent" < 1
    AND "yieldQuantity" > 0
  );

-- Prices and stock valuations are never negative.
ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_cost_non_negative" CHECK ("avgUnitCost" >= 0);
