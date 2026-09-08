-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTANT', 'KITCHEN', 'WAITER', 'INVENTORY_MANAGER');

-- CreateEnum
CREATE TYPE "UnitDimension" AS ENUM ('MASS', 'VOLUME', 'COUNT');

-- CreateEnum
CREATE TYPE "OverheadAllocationMethod" AS ENUM ('PER_UNIT', 'PERCENT_OF_REVENUE', 'PERCENT_OF_FOOD_COST', 'PER_LABOR_MINUTE', 'NONE');

-- CreateEnum
CREATE TYPE "LaborAllocationMethod" AS ENUM ('PER_MINUTE', 'PERCENT_OF_REVENUE', 'PER_UNIT', 'NONE');

-- CreateEnum
CREATE TYPE "RoundingRule" AS ENUM ('NONE', 'NEAREST_1000', 'NEAREST_5000', 'NEAREST_10000', 'CHARM_9');

-- CreateEnum
CREATE TYPE "PricingStrategy" AS ENUM ('TARGET_GROSS_MARGIN', 'TARGET_FOOD_COST', 'COST_PLUS_MARKUP', 'FIXED_PROFIT');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('MEAT', 'POULTRY', 'SEAFOOD', 'DAIRY', 'VEGETABLE', 'FRUIT', 'GRAIN', 'SPICE', 'OIL', 'BEVERAGE', 'PACKAGING', 'CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('PURCHASE_RECEIPT', 'SALE_DEPLETION', 'SALE_REVERSAL', 'WASTE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'COUNT_CORRECTION', 'PRODUCTION_IN', 'PRODUCTION_OUT');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('SPOILAGE', 'EXPIRED', 'BURNED', 'PREPARATION', 'OVERPRODUCTION', 'DAMAGED', 'UNKNOWN', 'OTHER');

-- CreateEnum
CREATE TYPE "RecipeType" AS ENUM ('MENU_ITEM', 'SUB_RECIPE', 'BATCH');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ModifierType" AS ENUM ('ADDITION', 'REMOVAL', 'SUBSTITUTION');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('FIXED', 'VARIABLE', 'ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'ONLINE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'INGREDIENT_PRICE_INCREASE', 'RECIPE_COST_INCREASE', 'MARGIN_BELOW_TARGET', 'HIGH_WASTE', 'COST_VARIANCE', 'ITEM_UNPROFITABLE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'IRT',
    "currencySymbol" TEXT NOT NULL DEFAULT 'تومان',
    "locale" TEXT NOT NULL DEFAULT 'fa-IR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "calendar" TEXT NOT NULL DEFAULT 'jalali',
    "phone" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "labelPersian" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "roleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitDefinition" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelPersian" TEXT NOT NULL,
    "dimension" "UnitDimension" NOT NULL,
    "factorToBase" DECIMAL(24,12) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UnitDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingProfile" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "laborMethod" "LaborAllocationMethod" NOT NULL DEFAULT 'PER_MINUTE',
    "laborCostPerMinute" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "laborPercentOfRevenue" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "monthlyLaborCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "overheadMethod" "OverheadAllocationMethod" NOT NULL DEFAULT 'PER_UNIT',
    "monthlyOverheadCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedMonthlyUnits" INTEGER NOT NULL DEFAULT 1,
    "overheadPercentOfRevenue" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "overheadPercentOfFoodCost" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "overheadPerLaborMinute" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pricingStrategy" "PricingStrategy" NOT NULL DEFAULT 'TARGET_GROSS_MARGIN',
    "targetGrossMargin" DECIMAL(9,6) NOT NULL DEFAULT 0.30,
    "targetFoodCostPct" DECIMAL(9,6) NOT NULL DEFAULT 0.30,
    "targetNetMargin" DECIMAL(9,6) NOT NULL DEFAULT 0.15,
    "markupMultiplier" DECIMAL(9,6) NOT NULL DEFAULT 3,
    "fixedDesiredProfit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "minimumMargin" DECIMAL(9,6) NOT NULL DEFAULT 0.10,
    "roundingRule" "RoundingRule" NOT NULL DEFAULT 'NEAREST_5000',
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "wasteBufferPct" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL DEFAULT 'OTHER',
    "sku" TEXT,
    "purchaseUnitId" TEXT NOT NULL,
    "recipeUnitId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(24,12) NOT NULL DEFAULT 1,
    "yieldPercent" DECIMAL(9,6) NOT NULL DEFAULT 1,
    "lastPurchasePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "averagePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "minimumStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "isPackaging" BOOLEAN NOT NULL DEFAULT false,
    "defaultSupplierId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientPriceHistory" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "price" DECIMAL(18,4) NOT NULL,
    "previousPrice" DECIMAL(18,4),
    "changePercent" DECIMAL(12,6),
    "source" TEXT NOT NULL DEFAULT 'PURCHASE',
    "referenceId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "ocrRaw" JSONB,
    "ocrConfidence" DECIMAL(5,4),
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avgUnitCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,8) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,6) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waste" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,8) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "reason" "WasteReason" NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DECIMAL(18,6) NOT NULL,
    "countedQty" DECIMAL(18,6) NOT NULL,
    "varianceQty" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,8) NOT NULL,
    "varianceValue" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "type" "RecipeType" NOT NULL DEFAULT 'MENU_ITEM',
    "description" TEXT,
    "yieldQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "yieldUnitId" TEXT,
    "portionSize" DECIMAL(18,6),
    "recipeYieldPercent" DECIMAL(9,6) NOT NULL DEFAULT 1,
    "preparationLossPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "cookTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "subRecipeId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "yieldPercentOverride" DECIMAL(9,6),
    "wastePercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "costPerPortion" DECIMAL(18,4) NOT NULL,
    "changeNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "recipeId" TEXT,
    "costingProfileId" TEXT,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "description" TEXT,
    "descriptionPersian" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "sellingPrice" DECIMAL(18,4),
    "priceIsOverridden" BOOLEAN NOT NULL DEFAULT false,
    "packagingCostOverride" DECIMAL(18,4),
    "overheadCostOverride" DECIMAL(18,4),
    "laborMinutesOverride" INTEGER,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "autoSoldOut" BOOLEAN NOT NULL DEFAULT true,
    "availabilityManualOverrideAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allergens" TEXT[],
    "tags" TEXT[],
    "calories" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuAvailability" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT,
    "categoryId" TEXT,
    "dayOfWeek" INTEGER,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "MenuAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modifier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "type" "ModifierType" NOT NULL DEFAULT 'ADDITION',
    "priceDelta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "recipeId" TEXT,
    "quantityFactor" DECIMAL(9,4) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemModifier" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "salaryType" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
    "salaryAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "monthlyHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "burdenPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "hireDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePersian" TEXT NOT NULL,
    "isOverhead" BOOLEAN NOT NULL DEFAULT true,
    "isLabor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT NOT NULL,
    "supplierId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "type" "ExpenseType" NOT NULL DEFAULT 'VARIABLE',
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "payee" TEXT,
    "attachmentUrl" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceInterval" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "OrderChannel" NOT NULL DEFAULT 'DINE_IN',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tableNumber" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "notes" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderModifier" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceDelta" DECIMAL(18,4) NOT NULL,
    "costDelta" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "OrderModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSnapshot" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "ingredientCost" DECIMAL(18,4) NOT NULL,
    "subRecipeCost" DECIMAL(18,4) NOT NULL,
    "wasteAdjustment" DECIMAL(18,4) NOT NULL,
    "laborCost" DECIMAL(18,4) NOT NULL,
    "packagingCost" DECIMAL(18,4) NOT NULL,
    "overheadCost" DECIMAL(18,4) NOT NULL,
    "modifierCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "sellingPrice" DECIMAL(18,4) NOT NULL,
    "grossProfit" DECIMAL(18,4) NOT NULL,
    "grossMarginPct" DECIMAL(9,6) NOT NULL,
    "foodCostPct" DECIMAL(9,6) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "recipeVersion" INTEGER,
    "reason" TEXT NOT NULL DEFAULT 'SALE',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRCode" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'منوی دیجیتال',
    "token" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL DEFAULT '/menu',
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "Branch_restaurantId_idx" ON "Branch"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_restaurantId_code_key" ON "Branch"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_restaurantId_idx" ON "User"("restaurantId");

-- CreateIndex
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_entityType_entityId_idx" ON "AuditLog"("restaurantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_createdAt_idx" ON "AuditLog"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "UnitDefinition_restaurantId_idx" ON "UnitDefinition"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitDefinition_restaurantId_code_key" ON "UnitDefinition"("restaurantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_restaurantId_key_key" ON "Setting"("restaurantId", "key");

-- CreateIndex
CREATE INDEX "CostingProfile_restaurantId_idx" ON "CostingProfile"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "CostingProfile_restaurantId_name_key" ON "CostingProfile"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "Supplier_restaurantId_idx" ON "Supplier"("restaurantId");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_category_idx" ON "Ingredient"("restaurantId", "category");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_isActive_idx" ON "Ingredient"("restaurantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_restaurantId_name_key" ON "Ingredient"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "IngredientPriceHistory_ingredientId_effectiveAt_idx" ON "IngredientPriceHistory"("ingredientId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Purchase_restaurantId_purchaseDate_idx" ON "Purchase"("restaurantId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Purchase_restaurantId_status_idx" ON "Purchase"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_ingredientId_idx" ON "PurchaseItem"("ingredientId");

-- CreateIndex
CREATE INDEX "StockLevel_branchId_idx" ON "StockLevel"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_ingredientId_warehouseId_key" ON "StockLevel"("ingredientId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_ingredientId_occurredAt_idx" ON "InventoryTransaction"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_branchId_occurredAt_idx" ON "InventoryTransaction"("branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Waste_restaurantId_occurredAt_idx" ON "Waste"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Waste_ingredientId_idx" ON "Waste"("ingredientId");

-- CreateIndex
CREATE INDEX "InventoryCount_restaurantId_countedAt_idx" ON "InventoryCount"("restaurantId", "countedAt");

-- CreateIndex
CREATE INDEX "InventoryCountLine_countId_idx" ON "InventoryCountLine"("countId");

-- CreateIndex
CREATE INDEX "Recipe_restaurantId_type_idx" ON "Recipe"("restaurantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_restaurantId_name_key" ON "Recipe"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "RecipeItem_recipeId_idx" ON "RecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeItem_ingredientId_idx" ON "RecipeItem"("ingredientId");

-- CreateIndex
CREATE INDEX "RecipeItem_subRecipeId_idx" ON "RecipeItem"("subRecipeId");

-- CreateIndex
CREATE INDEX "RecipeVersion_recipeId_idx" ON "RecipeVersion"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_recipeId_version_key" ON "RecipeVersion"("recipeId", "version");

-- CreateIndex
CREATE INDEX "MenuCategory_restaurantId_sortOrder_idx" ON "MenuCategory"("restaurantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_restaurantId_name_key" ON "MenuCategory"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_categoryId_idx" ON "MenuItem"("restaurantId", "categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_availability_idx" ON "MenuItem"("restaurantId", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_restaurantId_name_key" ON "MenuItem"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "MenuAvailability_menuItemId_idx" ON "MenuAvailability"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuAvailability_categoryId_idx" ON "MenuAvailability"("categoryId");

-- CreateIndex
CREATE INDEX "Modifier_restaurantId_idx" ON "Modifier"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Modifier_restaurantId_name_key" ON "Modifier"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemModifier_menuItemId_modifierId_key" ON "MenuItemModifier"("menuItemId", "modifierId");

-- CreateIndex
CREATE INDEX "Employee_restaurantId_isActive_idx" ON "Employee"("restaurantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_restaurantId_name_key" ON "ExpenseCategory"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "Expense_restaurantId_expenseDate_idx" ON "Expense"("restaurantId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Order_restaurantId_placedAt_idx" ON "Order"("restaurantId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_idx" ON "Order"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_orderNumber_key" ON "Order"("restaurantId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");

-- CreateIndex
CREATE INDEX "OrderModifier_orderItemId_idx" ON "OrderModifier"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CostSnapshot_orderItemId_key" ON "CostSnapshot"("orderItemId");

-- CreateIndex
CREATE INDEX "CostSnapshot_menuItemId_capturedAt_idx" ON "CostSnapshot"("menuItemId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_token_key" ON "QRCode"("token");

-- CreateIndex
CREATE INDEX "QRCode_restaurantId_idx" ON "QRCode"("restaurantId");

-- CreateIndex
CREATE INDEX "Alert_restaurantId_isRead_createdAt_idx" ON "Alert"("restaurantId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_restaurantId_type_idx" ON "Alert"("restaurantId", "type");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDefinition" ADD CONSTRAINT "UnitDefinition_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingProfile" ADD CONSTRAINT "CostingProfile_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPriceHistory" ADD CONSTRAINT "IngredientPriceHistory_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPriceHistory" ADD CONSTRAINT "IngredientPriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_costingProfileId_fkey" FOREIGN KEY ("costingProfileId") REFERENCES "CostingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAvailability" ADD CONSTRAINT "MenuAvailability_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAvailability" ADD CONSTRAINT "MenuAvailability_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifier" ADD CONSTRAINT "MenuItemModifier_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifier" ADD CONSTRAINT "MenuItemModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Modifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderModifier" ADD CONSTRAINT "OrderModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderModifier" ADD CONSTRAINT "OrderModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Modifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshot" ADD CONSTRAINT "CostSnapshot_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshot" ADD CONSTRAINT "CostSnapshot_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
