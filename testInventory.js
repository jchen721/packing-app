const { subtractInventory, getInventory } = require("./inventoryManager");

const result = subtractInventory([
  { item: "Chaos Rising Packs", quantity: 10 },
  { item: "Gem Packs", quantity: 5 },
  { item: "8x8x4 Boxes", quantity: 2 }
]);

console.log("Update result:", result);

console.log("Current inventory:");
console.table(getInventory());