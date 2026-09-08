-- Deleting an ingredient used by a recipe previously set RecipeItem.ingredientId
-- to NULL, leaving a BOM line that points at neither an ingredient nor a
-- sub-recipe. That violates RecipeItem_ingredient_xor_subrecipe, and would
-- otherwise have silently removed that line's cost from every dish above it.
-- Restrict makes the delete fail instead, so the recipe is corrected first.
ALTER TABLE "RecipeItem" DROP CONSTRAINT IF EXISTS "RecipeItem_ingredientId_fkey";
ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecipeItem" DROP CONSTRAINT IF EXISTS "RecipeItem_subRecipeId_fkey";
ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_subRecipeId_fkey"
  FOREIGN KEY ("subRecipeId") REFERENCES "Recipe"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
