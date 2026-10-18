/**
 * Crafting recipes + inventory craft planner
 */

import type { Inventory } from "../inventory/Inventory";

export interface RecipeIngredient {
  networkId: number;
  count: number;
}

export interface Recipe {
  id: string;
  type: "shaped" | "shapeless" | "furnace" | "smithing";
  result: RecipeIngredient;
  ingredients: RecipeIngredient[];
  width?: number;
  height?: number;
}

const recipes: Recipe[] = [
  {
    id: "stick",
    type: "shaped",
    width: 1,
    height: 2,
    ingredients: [
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
    ],
    result: { networkId: 280, count: 4 },
  },
  {
    id: "crafting_table",
    type: "shaped",
    width: 2,
    height: 2,
    ingredients: [
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
    ],
    result: { networkId: 58, count: 1 },
  },
  {
    id: "chest",
    type: "shaped",
    width: 3,
    height: 3,
    ingredients: Array(8).fill({ networkId: 5, count: 1 }),
    result: { networkId: 54, count: 1 },
  },
  {
    id: "furnace",
    type: "shaped",
    width: 3,
    height: 3,
    ingredients: Array(8).fill({ networkId: 4, count: 1 }),
    result: { networkId: 61, count: 1 },
  },
  {
    id: "wooden_pickaxe",
    type: "shaped",
    width: 3,
    height: 3,
    ingredients: [
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 280, count: 1 },
      { networkId: 280, count: 1 },
    ],
    result: { networkId: 270, count: 1 },
  },
  {
    id: "wooden_axe",
    type: "shaped",
    width: 2,
    height: 3,
    ingredients: [
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 5, count: 1 },
      { networkId: 280, count: 1 },
      { networkId: 280, count: 1 },
    ],
    result: { networkId: 271, count: 1 },
  },
  {
    id: "stone_pickaxe",
    type: "shaped",
    width: 3,
    height: 3,
    ingredients: [
      { networkId: 4, count: 1 },
      { networkId: 4, count: 1 },
      { networkId: 4, count: 1 },
      { networkId: 280, count: 1 },
      { networkId: 280, count: 1 },
    ],
    result: { networkId: 274, count: 1 },
  },
  {
    id: "bread",
    type: "shapeless",
    ingredients: [{ networkId: 296, count: 3 }],
    result: { networkId: 297, count: 1 },
  },
  {
    id: "furnace_iron",
    type: "furnace",
    ingredients: [{ networkId: 15, count: 1 }],
    result: { networkId: 265, count: 1 },
  },
  {
    id: "furnace_gold",
    type: "furnace",
    ingredients: [{ networkId: 14, count: 1 }],
    result: { networkId: 266, count: 1 },
  },
  {
    id: "furnace_beef",
    type: "furnace",
    ingredients: [{ networkId: 363, count: 1 }],
    result: { networkId: 364, count: 1 },
  },
];

function neededMap(r: Recipe): Map<number, number> {
  const m = new Map<number, number>();
  for (const ing of r.ingredients) {
    m.set(ing.networkId, (m.get(ing.networkId) ?? 0) + ing.count);
  }
  return m;
}

export const RecipeRegistry = {
  list(): Recipe[] {
    return recipes;
  },
  get(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  },
  findByResult(networkId: number): Recipe[] {
    return recipes.filter((r) => r.result.networkId === networkId);
  },
  register(r: Recipe) {
    recipes.push(r);
  },
  /** Whether inventory has enough items for one craft */
  canCraft(recipe: Recipe, inv: Inventory): boolean {
    const need = neededMap(recipe);
    for (const [id, count] of need) {
      if (inv.count(id) < count) return false;
    }
    return true;
  },
  /**
   * Local craft simulation: deduct ingredients, add result.
   * Live BDS also needs InventoryTransaction / ItemStackRequest — this updates client state.
   */
  craft(recipe: Recipe, inv: Inventory): boolean {
    if (!this.canCraft(recipe, inv)) return false;
    const need = neededMap(recipe);
    for (const [id, count] of need) {
      let left = count;
      for (let slot = 0; slot < 36 && left > 0; slot++) {
        const it = inv.getSlot(slot);
        if (!it || it.networkId !== id) continue;
        const take = Math.min(left, it.count);
        it.count -= take;
        left -= take;
        if (it.count <= 0) inv.setSlot(slot, null);
        else inv.setSlot(slot, it);
      }
      if (left > 0) return false;
    }
    // Place result in first empty / merge stack
    const res = recipe.result;
    const merge = inv.findItem((i) => i.networkId === res.networkId && i.count < 64);
    if (merge) {
      const room = 64 - merge.item.count;
      const add = Math.min(room, res.count);
      merge.item.count += add;
      inv.setSlot(merge.slot, merge.item);
      if (add < res.count) {
        // overflow ignored in simple model
      }
    } else {
      for (let slot = 0; slot < 36; slot++) {
        if (!inv.getSlot(slot)) {
          inv.setSlot(slot, { networkId: res.networkId, count: res.count, slot });
          break;
        }
      }
    }
    return true;
  },
};
