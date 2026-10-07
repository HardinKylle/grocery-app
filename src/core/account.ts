// The Account core: pure domain rules from GLOSSARY.md.
// No UI or Firebase code belongs in src/core.
// Commands, queries, and ports (storage, barcode lookup, clock) arrive in
// later tickets; this is the starting shape.

export type Product = {
  id: string;
  name: string;
  count: number;
};

export type Account = {
  inventory(): Product[];
  shoppingList(): Product[];
  catalog(): Product[];
};

export function createAccount(): Account {
  return {
    inventory: () => [],
    shoppingList: () => [],
    catalog: () => [],
  };
}
