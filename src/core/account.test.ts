import { describe, expect, it } from 'vitest';
import { createAccount } from './account';
import { createMemoryStorage } from './memoryStorage';
import type { Clock } from './ports';

const fixedClock: Clock = { now: () => new Date('2026-10-07T08:00:00+08:00') };

function setup() {
  const storage = createMemoryStorage();
  const account = createAccount({ storage, clock: fixedClock });
  return { account, storage };
}

function countOf(account: ReturnType<typeof setup>['account'], id: string) {
  return account.catalog().find((p) => p.id === id)?.count;
}

function names(products: { name: string }[]) {
  return products.map((p) => p.name);
}

describe('Account', () => {
  it('starts with an empty Inventory, Shopping List, and Catalog', () => {
    const { account } = setup();
    expect(account.inventory()).toEqual([]);
    expect(account.shoppingList()).toEqual([]);
    expect(account.catalog()).toEqual([]);
  });
});

describe('subscribe', () => {
  it('tells listeners when the Account changes, until they unsubscribe', () => {
    const { account } = setup();
    let calls = 0;
    const unsubscribe = account.subscribe(() => calls++);
    const eggs = account.addProductByName('Eggs', 1);
    account.increment(eggs);
    unsubscribe();
    account.increment(eggs);
    expect(calls).toBe(2);
  });
});

describe('addProductByName', () => {
  it('adds the Product to the Catalog with the chosen count', () => {
    const { account } = setup();
    account.addProductByName('Bear Brand Milk', 3);
    expect(account.catalog()).toMatchObject([{ name: 'Bear Brand Milk', count: 3 }]);
  });
});

describe('Product names', () => {
  it('are trimmed', () => {
    const { account } = setup();
    account.addProductByName('  Eggs  ', 1);
    expect(names(account.catalog())).toEqual(['Eggs']);
  });

  it('cannot be blank', () => {
    const { account } = setup();
    expect(() => account.addProductByName('   ', 1)).toThrow();
    expect(account.catalog()).toEqual([]);
  });

  it('can be changed with renameProduct', () => {
    const { account } = setup();
    const milk = account.addProductByName('Bear Brnad Milk', 1);
    account.renameProduct(milk, ' Bear Brand Milk ');
    expect(account.catalog()).toMatchObject([{ id: milk, name: 'Bear Brand Milk', count: 1 }]);
  });

  it('keep the old name when renamed to blank', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    expect(() => account.renameProduct(milk, '')).toThrow();
    expect(names(account.catalog())).toEqual(['Milk']);
  });
});

describe('deleteProduct', () => {
  it('removes the Product from the Catalog and the Inventory', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 6);
    account.addProductByName('Rice', 1);
    account.deleteProduct(eggs);
    expect(names(account.catalog())).toEqual(['Rice']);
    expect(names(account.inventory())).toEqual(['Rice']);
  });
});

describe('inventory', () => {
  it('shows only Products with a count of 1 or more', () => {
    const { account } = setup();
    account.addProductByName('Rice', 0);
    account.addProductByName('Eggs', 12);
    expect(names(account.inventory())).toEqual(['Eggs']);
    expect(names(account.catalog())).toContain('Rice');
  });

  it('is sorted by name', () => {
    const { account } = setup();
    account.addProductByName('eggs', 6);
    account.addProductByName('Bear Brand Milk', 1);
    account.addProductByName('Carrots', 2);
    expect(names(account.inventory())).toEqual(['Bear Brand Milk', 'Carrots', 'eggs']);
  });
});

describe('counting', () => {
  it('increment adds one and decrement takes one away', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 2);
    account.increment(eggs);
    account.increment(eggs);
    account.decrement(eggs);
    expect(countOf(account, eggs)).toBe(3);
  });

  it('never goes below 0', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.decrement(eggs);
    expect(countOf(account, eggs)).toBe(0);
  });

  it('setCount sets the count directly', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.setCount(eggs, 30);
    expect(countOf(account, eggs)).toBe(30);
  });

  it('keeps counts whole and at least 0', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 2.7);
    expect(countOf(account, eggs)).toBe(2);
    account.setCount(eggs, -4);
    expect(countOf(account, eggs)).toBe(0);
    account.setCount(eggs, 5.9);
    expect(countOf(account, eggs)).toBe(5);
    account.setCount(eggs, Number.NaN);
    expect(countOf(account, eggs)).toBe(5);
  });

  it('moves a Product into and out of the Inventory as its count crosses 1', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 0);
    account.increment(rice);
    expect(names(account.inventory())).toEqual(['Rice']);
    account.decrement(rice);
    expect(account.inventory()).toEqual([]);
  });
});

describe('Expiry Date', () => {
  function expiryOf(account: ReturnType<typeof setup>['account'], id: string) {
    return account.catalog().find((p) => p.id === id)?.expiryDate;
  }

  it('is off by default', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    expect(expiryOf(account, milk)).toBeNull();
  });

  it('can be set, changed, and cleared, and shows in the Inventory', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 2);
    account.setExpiryDate(milk, '2026-10-12');
    expect(account.inventory()).toMatchObject([{ name: 'Milk', expiryDate: '2026-10-12' }]);
    account.setExpiryDate(milk, '2026-10-09');
    expect(expiryOf(account, milk)).toBe('2026-10-09');
    account.setExpiryDate(milk, null);
    expect(expiryOf(account, milk)).toBeNull();
  });

  it('rejects dates that are not YYYY-MM-DD calendar days', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    expect(() => account.setExpiryDate(milk, '12/10/2026')).toThrow();
    expect(() => account.setExpiryDate(milk, '2026-02-30')).toThrow();
    expect(expiryOf(account, milk)).toBeNull();
  });

  it('clears when the count drops to 0', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    account.setExpiryDate(milk, '2026-10-12');
    account.decrement(milk);
    account.increment(milk);
    expect(expiryOf(account, milk)).toBeNull();
  });

  it('clears when the count is set to 0', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 4);
    account.setExpiryDate(milk, '2026-10-12');
    account.setCount(milk, 0);
    expect(expiryOf(account, milk)).toBeNull();
  });

  it('stays while the count is above 0', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 2);
    account.setExpiryDate(milk, '2026-10-12');
    account.decrement(milk);
    account.setCount(milk, 5);
    expect(expiryOf(account, milk)).toBe('2026-10-12');
  });

  it('cannot be set on a Product that is not at home', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 0);
    account.setExpiryDate(milk, '2026-10-12');
    expect(expiryOf(account, milk)).toBeNull();
  });
});

describe('catalog', () => {
  it('records when each Product was added, from the clock', () => {
    const { account } = setup();
    account.addProductByName('Eggs', 1);
    expect(account.catalog()[0].addedAt).toBe('2026-10-07T00:00:00.000Z');
  });

  it('shows every Product with its count, sorted by name', () => {
    const { account } = setup();
    account.addProductByName('Rice', 0);
    account.addProductByName('Eggs', 12);
    expect(account.catalog()).toMatchObject([
      { name: 'Eggs', count: 12 },
      { name: 'Rice', count: 0 },
    ]);
  });

  it('searches by name, ignoring case and position', () => {
    const { account } = setup();
    account.addProductByName('Bear Brand Milk', 1);
    account.addProductByName('Oat Milk', 0);
    account.addProductByName('Eggs', 12);
    expect(names(account.catalog('milk'))).toEqual(['Bear Brand Milk', 'Oat Milk']);
    expect(names(account.catalog('  EGG '))).toEqual(['Eggs']);
    expect(names(account.catalog(''))).toHaveLength(3);
  });
});

describe('Shopping List', () => {
  function entry(account: ReturnType<typeof setup>['account'], id: string) {
    return account.shoppingList().find((p) => p.id === id)?.shoppingList;
  }

  it('takes any Catalog Product, with a buy quantity of 1, not checked off', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 0);
    account.addProductByName('Eggs', 6);
    account.addToShoppingList(rice);
    expect(names(account.shoppingList())).toEqual(['Rice']);
    expect(entry(account, rice)).toEqual({ buyQuantity: 1, checkedOff: false });
  });

  it('keeps the entry as it is when the Product is added again', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 0);
    account.addToShoppingList(rice);
    account.setBuyQuantity(rice, 3);
    account.checkOff(rice);
    account.addToShoppingList(rice);
    expect(entry(account, rice)).toEqual({ buyQuantity: 3, checkedOff: true });
    expect(countOf(account, rice)).toBe(3);
  });

  it('lets the buy quantity change, as a whole number of at least 1', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 0);
    account.addToShoppingList(eggs);
    account.setBuyQuantity(eggs, 12);
    expect(entry(account, eggs)?.buyQuantity).toBe(12);
    account.setBuyQuantity(eggs, 2.8);
    expect(entry(account, eggs)?.buyQuantity).toBe(2);
    account.setBuyQuantity(eggs, 0);
    expect(entry(account, eggs)?.buyQuantity).toBe(1);
    account.setBuyQuantity(eggs, Number.NaN);
    expect(entry(account, eggs)?.buyQuantity).toBe(1);
  });

  it('keeps the buy quantity fixed while checked off, so un-checking undoes exactly', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 0);
    account.addToShoppingList(eggs);
    account.setBuyQuantity(eggs, 2);
    account.checkOff(eggs);
    account.setBuyQuantity(eggs, 5);
    expect(entry(account, eggs)?.buyQuantity).toBe(2);
    expect(countOf(account, eggs)).toBe(2);
  });

  it('checking off adds the buy quantity to the count at once and keeps the entry crossed out', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    account.addToShoppingList(milk);
    account.setBuyQuantity(milk, 3);
    account.checkOff(milk);
    expect(countOf(account, milk)).toBe(4);
    expect(account.shoppingList()).toMatchObject([
      { id: milk, shoppingList: { buyQuantity: 3, checkedOff: true } },
    ]);
  });

  it('checking off twice adds only once', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 0);
    account.addToShoppingList(milk);
    account.checkOff(milk);
    account.checkOff(milk);
    expect(countOf(account, milk)).toBe(1);
  });

  it('a checked-off Product shows in the Inventory', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 0);
    account.addToShoppingList(rice);
    account.checkOff(rice);
    expect(names(account.inventory())).toEqual(['Rice']);
  });

  it('un-checking subtracts the buy quantity again', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    account.addToShoppingList(milk);
    account.setBuyQuantity(milk, 3);
    account.checkOff(milk);
    account.uncheck(milk);
    expect(countOf(account, milk)).toBe(1);
    expect(entry(account, milk)).toEqual({ buyQuantity: 3, checkedOff: false });
    account.uncheck(milk);
    expect(countOf(account, milk)).toBe(1);
  });

  it('un-checking never takes the count below 0', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 0);
    account.addToShoppingList(milk);
    account.setBuyQuantity(milk, 3);
    account.checkOff(milk);
    account.decrement(milk);
    account.decrement(milk);
    account.uncheck(milk);
    expect(countOf(account, milk)).toBe(0);
  });

  it('un-checking down to 0 clears the Expiry Date', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 0);
    account.addToShoppingList(milk);
    account.checkOff(milk);
    account.setExpiryDate(milk, '2026-10-12');
    account.uncheck(milk);
    expect(account.catalog()[0].expiryDate).toBeNull();
  });

  it('can remove a Product without buying it; it stays in the Catalog', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 2);
    account.addToShoppingList(milk);
    account.removeFromShoppingList(milk);
    expect(account.shoppingList()).toEqual([]);
    expect(account.catalog()).toMatchObject([{ id: milk, count: 2, shoppingList: null }]);
  });

  it('Done Shopping clears checked-off Products and carries the rest over', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    const eggs = account.addProductByName('Eggs', 0);
    const rice = account.addProductByName('Rice', 0);
    for (const id of [milk, eggs, rice]) account.addToShoppingList(id);
    account.setBuyQuantity(milk, 2);
    account.setBuyQuantity(rice, 4);
    account.checkOff(milk);
    account.checkOff(eggs);
    account.doneShopping();
    expect(account.shoppingList()).toMatchObject([
      { id: rice, shoppingList: { buyQuantity: 4, checkedOff: false } },
    ]);
    // Counts added at check-off are kept.
    expect(countOf(account, milk)).toBe(3);
    expect(countOf(account, eggs)).toBe(1);
    expect(countOf(account, rice)).toBe(0);
  });

  it('is sorted by name', () => {
    const { account } = setup();
    for (const name of ['rice', 'Bear Brand Milk', 'Carrots']) {
      account.addToShoppingList(account.addProductByName(name, 0));
    }
    expect(names(account.shoppingList())).toEqual(['Bear Brand Milk', 'Carrots', 'rice']);
  });

  it('typing a new name creates a Catalog Product at count 0 and adds it', () => {
    const { account } = setup();
    const id = account.addToShoppingListByName(' Fish Sauce ');
    expect(account.catalog()).toMatchObject([{ id, name: 'Fish Sauce', count: 0 }]);
    expect(account.shoppingList()).toMatchObject([
      { id, shoppingList: { buyQuantity: 1, checkedOff: false } },
    ]);
    expect(account.inventory()).toEqual([]);
  });

  it('typing the name of a Catalog Product adds that Product, not a copy', () => {
    const { account } = setup();
    const milk = account.addProductByName('Bear Brand Milk', 2);
    expect(account.addToShoppingListByName('bear brand milk ')).toBe(milk);
    expect(account.catalog()).toHaveLength(1);
    expect(account.shoppingList()).toMatchObject([{ id: milk, count: 2 }]);
  });

  it('typing a blank name adds nothing', () => {
    const { account } = setup();
    expect(() => account.addToShoppingListByName('  ')).toThrow();
    expect(account.catalog()).toEqual([]);
  });

  it('never gets a Product without a direct add', () => {
    const { account } = setup();
    const milk = account.addProductByName('Milk', 1);
    const rice = account.addProductByName('Rice', 0);
    account.decrement(milk);
    account.setCount(rice, 3);
    account.setCount(rice, 0);
    account.renameProduct(milk, 'Fresh Milk');
    account.setExpiryDate(rice, '2026-10-12');
    account.doneShopping();
    expect(account.shoppingList()).toEqual([]);
  });

  it('loses a Product when the Product is deleted', () => {
    const { account } = setup();
    const milk = account.addToShoppingListByName('Milk');
    account.deleteProduct(milk);
    expect(account.shoppingList()).toEqual([]);
  });

  it('ignores a buy quantity for a Product not on the list', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 0);
    account.setBuyQuantity(eggs, 4);
    expect(account.shoppingList()).toEqual([]);
  });
});

describe('Low Stock', () => {
  it('is off by default', () => {
    const { account } = setup();
    account.addProductByName('Eggs', 1);
    expect(account.catalog()[0].lowStockThreshold).toBeNull();
    expect(account.lowStock()).toEqual([]);
  });

  it('flags a count above 0 and at or below the threshold', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 4);
    account.setLowStockThreshold(eggs, 3);
    expect(account.lowStock()).toEqual([]);
    account.decrement(eggs);
    expect(names(account.lowStock())).toEqual(['Eggs']);
    account.setCount(eggs, 1);
    expect(names(account.lowStock())).toEqual(['Eggs']);
    account.decrement(eggs);
    expect(account.lowStock()).toEqual([]);
  });

  it('stops flagging when the threshold is turned off', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 2);
    account.setLowStockThreshold(eggs, 2);
    account.setLowStockThreshold(eggs, null);
    expect(account.lowStock()).toEqual([]);
    account.setLowStockThreshold(eggs, 2);
    account.setLowStockThreshold(eggs, 0);
    expect(account.catalog()[0].lowStockThreshold).toBeNull();
  });

  it('keeps the threshold a whole number', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 2);
    account.setLowStockThreshold(eggs, 2.7);
    expect(account.catalog()[0].lowStockThreshold).toBe(2);
    account.setLowStockThreshold(eggs, Number.NaN);
    expect(account.catalog()[0].lowStockThreshold).toBe(2);
  });

  it('is sorted by name', () => {
    const { account } = setup();
    for (const name of ['rice', 'Bear Brand Milk', 'Carrots']) {
      account.setLowStockThreshold(account.addProductByName(name, 1), 1);
    }
    expect(names(account.lowStock())).toEqual(['Bear Brand Milk', 'Carrots', 'rice']);
  });
});

describe('Out of Stock', () => {
  it('flags a Product whose count drops from 1 or more to 0', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 2);
    account.decrement(eggs);
    expect(account.outOfStock()).toEqual([]);
    account.decrement(eggs);
    expect(names(account.outOfStock())).toEqual(['Eggs']);
    expect(names(account.catalog())).toEqual(['Eggs']);
  });

  it('does not flag a Product that was never at home', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 0);
    account.setCount(rice, 0);
    account.decrement(rice);
    account.addToShoppingListByName('Fish Sauce');
    account.removeFromShoppingList(account.catalog()[0].id);
    expect(account.outOfStock()).toEqual([]);
  });

  it('flags a count set straight to 0', () => {
    const { account } = setup();
    const rice = account.addProductByName('Rice', 5);
    account.setCount(rice, 0);
    expect(names(account.outOfStock())).toEqual(['Rice']);
  });

  it('is hidden while the Product is on the Shopping List', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.addToShoppingList(eggs);
    expect(account.outOfStock()).toEqual([]);
    account.removeFromShoppingList(eggs);
    expect(names(account.outOfStock())).toEqual(['Eggs']);
  });

  it('clears when stock is added again', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.increment(eggs);
    expect(account.outOfStock()).toEqual([]);
    expect(account.catalog()[0].outOfStock).toBe(false);
  });

  it('clears when the Product is checked off the Shopping List', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.addToShoppingList(eggs);
    account.checkOff(eggs);
    account.doneShopping();
    expect(account.outOfStock()).toEqual([]);
    expect(account.catalog()[0].outOfStock).toBe(false);
  });

  it('comes back when a check-off is undone back to 0', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.addToShoppingList(eggs);
    account.checkOff(eggs);
    account.uncheck(eggs);
    account.removeFromShoppingList(eggs);
    expect(names(account.outOfStock())).toEqual(['Eggs']);
  });

  it('can be dismissed; the Product stays in the Catalog', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.dismissOutOfStock(eggs);
    expect(account.outOfStock()).toEqual([]);
    expect(names(account.catalog())).toEqual(['Eggs']);
  });

  it('forgets a dismiss once stock is added again', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.decrement(eggs);
    account.dismissOutOfStock(eggs);
    account.increment(eggs);
    expect(account.catalog()[0]).toMatchObject({ outOfStock: false, dismissed: false });
    account.decrement(eggs);
    expect(names(account.outOfStock())).toEqual(['Eggs']);
  });

  it('ignores a dismiss for a Product that is not Out of Stock', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.dismissOutOfStock(eggs);
    account.decrement(eggs);
    expect(names(account.outOfStock())).toEqual(['Eggs']);
  });
});

describe('stock flags', () => {
  it('never add a Product to the Shopping List', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 3);
    const milk = account.addProductByName('Milk', 1);
    account.setLowStockThreshold(eggs, 2);
    account.decrement(eggs);
    account.decrement(milk);
    account.dismissOutOfStock(milk);
    expect(names(account.lowStock())).toEqual(['Eggs']);
    expect(account.shoppingList()).toEqual([]);
  });

  it('let a flagged Product be added to the Shopping List', () => {
    const { account } = setup();
    const eggs = account.addProductByName('Eggs', 1);
    account.setLowStockThreshold(eggs, 1);
    account.addToShoppingList(eggs);
    expect(names(account.shoppingList())).toEqual(['Eggs']);
  });
});
