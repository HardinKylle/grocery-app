import { describe, expect, it } from 'vitest';
import { createAccount } from './account';

describe('Account', () => {
  it('starts with an empty Inventory, Shopping List, and Catalog', () => {
    const account = createAccount();
    expect(account.inventory()).toEqual([]);
    expect(account.shoppingList()).toEqual([]);
    expect(account.catalog()).toEqual([]);
  });
});
