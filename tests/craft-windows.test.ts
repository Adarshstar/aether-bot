import { describe, test, expect } from "bun:test";
import { RecipeRegistry } from "../src/recipe/Recipe";
import { Inventory } from "../src/inventory/Inventory";
import { WindowManager } from "../src/windows/Window";
import { ItemRegistry } from "../src/registry/items";
import { BlockRegistry } from "../src/registry/blocks";

describe("crafting + containers", () => {
  test("can craft sticks from planks", () => {
    const inv = new Inventory();
    inv.setSlot(0, { networkId: 5, count: 2, name: "planks" });
    const recipe = RecipeRegistry.get("stick")!;
    expect(RecipeRegistry.canCraft(recipe, inv)).toBe(true);
    expect(RecipeRegistry.craft(recipe, inv)).toBe(true);
    expect(inv.count(280)).toBeGreaterThanOrEqual(4);
  });

  test("cannot craft without ingredients", () => {
    const inv = new Inventory();
    const recipe = RecipeRegistry.get("crafting_table")!;
    expect(RecipeRegistry.canCraft(recipe, inv)).toBe(false);
  });

  test("window manager opens chest and crafting", () => {
    const wm = new WindowManager();
    const chest = wm.openChest("Test");
    expect(chest.type).toBe("chest");
    expect(chest.containerSize).toBe(27);
    chest.setSlot(0, { networkId: 4, count: 16 } as any);
    expect(chest.getSlot(0)?.count).toBe(16);
    const craft = wm.openCrafting();
    expect(craft.type).toBe("crafting");
    wm.close();
    expect(wm.active).toBeNull();
  });

  test("item and block registries expanded", () => {
    expect(ItemRegistry.size()).toBeGreaterThan(40);
    expect(BlockRegistry.size()).toBeGreaterThan(80);
    expect(BlockRegistry.idsWithTag("ore").length).toBeGreaterThan(3);
    expect(ItemRegistry.isFood(297)).toBe(true);
  });
});
