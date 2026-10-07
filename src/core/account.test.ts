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
