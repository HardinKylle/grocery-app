import { describe, expect, it } from 'vitest';
import { createAccount, LookupUnavailable, type BarcodeLookup, type LookupHit } from './account';
import { createMemoryStorage } from './memoryStorage';
import type { Clock } from './ports';

const fixedClock: Clock = { now: () => new Date('2026-10-07T08:00:00+08:00') };

/** A fake Open Food Facts: a fixed table of hits, plus an online switch. */
function fakeLookup(hits: Record<string, LookupHit> = {}) {
  const asked: string[] = [];
  const lookup: BarcodeLookup & { online: boolean; asked: string[] } = {
    online: true,
    asked,
    isOnline: () => lookup.online,
    async lookup(barcode) {
      asked.push(barcode);
      return hits[barcode] ?? null;
    },
  };
  return lookup;
}

function setup(hits: Record<string, LookupHit> = {}) {
  const storage = createMemoryStorage();
  const barcodeLookup = fakeLookup(hits);
  const account = createAccount({ storage, clock: fixedClock, barcodeLookup });
  return { account, barcodeLookup };
}

type TestAccount = ReturnType<typeof setup>['account'];

/** A Catalog Product with `count` at home, added the way the app does it. */
function addStocked(account: TestAccount, name: string, count: number) {
  const id = account.addProduct({ name });
  if (count > 0) account.addToInventory(id, count, null);
  return id;
}


function productOf(account: TestAccount, id: string) {
  return account.catalog().find((p) => p.id === id);
}

const BEAR_BRAND = '4800361339421';

describe('scan in Inventory mode, known Barcode', () => {
  it('adds 1 to the count right away', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 2);
    account.linkBarcode(milk, BEAR_BRAND);

    const result = await account.scan(BEAR_BRAND, 'inventory');

    expect(result).toMatchObject({ kind: 'applied', effect: 'countUp' });
    expect(productOf(account, milk)?.count).toBe(3);
  });

  it('can be undone', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);

    const result = await account.scan(BEAR_BRAND, 'inventory');
    if (result.kind !== 'applied') throw new Error('expected applied');
    result.undo();

    expect(productOf(account, milk)?.count).toBe(0);
    expect(account.inventory()).toEqual([]);
  });

  it('brings an Out of Stock Product back, and undo puts it back in Out of Stock', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.linkBarcode(milk, BEAR_BRAND);
    account.decrement(milk);

    const result = await account.scan(BEAR_BRAND, 'inventory');
    expect(account.outOfStock()).toEqual([]);

    if (result.kind !== 'applied') throw new Error('expected applied');
    result.undo();
    expect(account.outOfStock()).toMatchObject([{ id: milk, count: 0 }]);
  });
});

describe('scan in Shopping List mode, known Barcode', () => {
  it('puts the Product on the Shopping List with a buy quantity of 1', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.linkBarcode(milk, BEAR_BRAND);

    const result = await account.scan(BEAR_BRAND, 'shoppingList');

    expect(result).toMatchObject({ kind: 'applied', effect: 'addedToList' });
    expect(account.shoppingList()).toMatchObject([
      { id: milk, count: 1, shoppingList: { buyQuantity: 1, checkedOff: false } },
    ]);
  });

  it('adds 1 to the buy quantity when the Product is already on the list', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);

    await account.scan(BEAR_BRAND, 'shoppingList');
    const result = await account.scan(BEAR_BRAND, 'shoppingList');

    expect(result).toMatchObject({ kind: 'applied', effect: 'buyQuantityUp' });
    expect(productOf(account, milk)?.shoppingList?.buyQuantity).toBe(2);
  });

  it('undo takes a newly added Product off the list again', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);

    const result = await account.scan(BEAR_BRAND, 'shoppingList');
    if (result.kind !== 'applied') throw new Error('expected applied');
    result.undo();

    expect(account.shoppingList()).toEqual([]);
  });

  it('undo takes the extra 1 off the buy quantity', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);
    account.addToShoppingList(milk);
    account.setBuyQuantity(milk, 3);

    const result = await account.scan(BEAR_BRAND, 'shoppingList');
    if (result.kind !== 'applied') throw new Error('expected applied');
    result.undo();

    expect(productOf(account, milk)?.shoppingList?.buyQuantity).toBe(3);
  });

  it('leaves a checked-off entry alone', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);
    account.addToShoppingList(milk);
    account.checkOff(milk);

    const result = await account.scan(BEAR_BRAND, 'shoppingList');

    expect(result).toMatchObject({ kind: 'applied', effect: 'alreadyCheckedOff' });
    expect(productOf(account, milk)).toMatchObject({
      count: 1,
      shoppingList: { buyQuantity: 1, checkedOff: true },
    });
  });
});

describe('scan, unknown Barcode', () => {
  const NUTELLA = '3017624010701';
  const nutellaHit = { name: 'Nutella', photoUrl: 'https://images.example/nutella.jpg' };

  it('suggests the name and photo found by the lookup, changing nothing yet', async () => {
    const { account } = setup({ [NUTELLA]: nutellaHit });

    const result = await account.scan(NUTELLA, 'inventory');

    expect(result).toEqual({
      kind: 'unknown',
      barcode: NUTELLA,
      lookup: 'found',
      suggestion: nutellaHit,
    });
    expect(account.catalog()).toEqual([]);
  });

  it('says not found when the lookup has nothing', async () => {
    const { account } = setup();

    const result = await account.scan(NUTELLA, 'inventory');

    expect(result).toEqual({ kind: 'unknown', barcode: NUTELLA, lookup: 'notFound', suggestion: null });
  });

  it('skips the lookup when offline', async () => {
    const { account, barcodeLookup } = setup({ [NUTELLA]: nutellaHit });
    barcodeLookup.online = false;

    const result = await account.scan(NUTELLA, 'inventory');

    expect(result).toEqual({ kind: 'unknown', barcode: NUTELLA, lookup: 'offline', suggestion: null });
    expect(barcodeLookup.asked).toEqual([]);
  });

  it('treats a failed lookup like offline', async () => {
    const storage = createMemoryStorage();
    const account = createAccount({
      storage,
      clock: fixedClock,
      barcodeLookup: { isOnline: () => true, lookup: () => Promise.reject(new Error('timeout')) },
    });

    const result = await account.scan(NUTELLA, 'inventory');

    expect(result).toMatchObject({ kind: 'unknown', lookup: 'offline', suggestion: null });
  });

  it('reports the lookup as unavailable, not offline, when the service is busy', async () => {
    const storage = createMemoryStorage();
    const account = createAccount({
      storage,
      clock: fixedClock,
      barcodeLookup: {
        isOnline: () => true,
        lookup: () => Promise.reject(new LookupUnavailable('rate limit')),
      },
    });

    const result = await account.scan(NUTELLA, 'inventory');

    expect(result).toMatchObject({ kind: 'unknown', lookup: 'unavailable', suggestion: null });
  });

  it('never looks up a known Barcode, so known Barcodes work offline', async () => {
    const { account, barcodeLookup } = setup();
    barcodeLookup.online = false;
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, BEAR_BRAND);

    await account.scan(BEAR_BRAND, 'inventory');

    expect(productOf(account, milk)?.count).toBe(1);
    expect(barcodeLookup.asked).toEqual([]);
  });
});

describe('resolveScan', () => {
  const NUTELLA = '3017624010701';
  const photoUrl = 'https://images.example/nutella.jpg';

  it('confirming a lookup hit saves a new Product with its photo, at count 1 in Inventory mode', async () => {
    const { account, barcodeLookup } = setup({ [NUTELLA]: { name: 'Nutella', photoUrl } });
    const scanned = await account.scan(NUTELLA, 'inventory');
    if (scanned.kind !== 'unknown') throw new Error('expected unknown');

    const result = account.resolveScan(NUTELLA, 'inventory', {
      name: scanned.suggestion!.name,
      photoUrl: scanned.suggestion!.photoUrl,
    });

    expect(result).toMatchObject({ kind: 'applied', effect: 'countUp' });
    expect(account.inventory()).toMatchObject([
      { name: 'Nutella', count: 1, barcodes: [NUTELLA], photoUrl },
    ]);

    // The Barcode is remembered: the next scan needs no lookup.
    await account.scan(NUTELLA, 'inventory');
    expect(account.inventory()).toMatchObject([{ name: 'Nutella', count: 2 }]);
    expect(barcodeLookup.asked).toEqual([NUTELLA]);
  });

  it('a typed name after a miss, in Shopping List mode, adds the new Product to the list at count 0', async () => {
    const { account } = setup();
    await account.scan(BEAR_BRAND, 'shoppingList');

    const result = account.resolveScan(BEAR_BRAND, 'shoppingList', { name: ' Bear Brand Milk ' });

    expect(result).toMatchObject({ kind: 'applied', effect: 'addedToList' });
    expect(account.shoppingList()).toMatchObject([
      {
        name: 'Bear Brand Milk',
        count: 0,
        barcodes: [BEAR_BRAND],
        photoUrl: null,
        shoppingList: { buyQuantity: 1, checkedOff: false },
      },
    ]);
  });

  it('a typed name that matches a Catalog Product uses that Product', () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 2);

    account.resolveScan(BEAR_BRAND, 'inventory', { name: 'bear brand milk' });

    expect(account.catalog()).toMatchObject([{ id: milk, count: 3, barcodes: [BEAR_BRAND] }]);
  });

  it('cannot use a blank name', () => {
    const { account } = setup();
    expect(() => account.resolveScan(BEAR_BRAND, 'inventory', { name: '  ' })).toThrow();
    expect(account.catalog()).toEqual([]);
  });

  it('linking to an existing Product adds the Barcode and applies the Scan Mode', () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.linkBarcode(milk, '4800361000001');

    const result = account.resolveScan(BEAR_BRAND, 'inventory', { productId: milk, photoUrl });

    expect(result).toMatchObject({ kind: 'applied', effect: 'countUp' });
    expect(account.catalog()).toMatchObject([
      { id: milk, count: 2, barcodes: ['4800361000001', BEAR_BRAND], photoUrl },
    ]);
  });

  it('linking keeps a photo the Product already has', () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.resolveScan('4800361000001', 'inventory', { productId: milk, photoUrl: 'first.jpg' });

    account.resolveScan(BEAR_BRAND, 'inventory', { productId: milk, photoUrl: 'second.jpg' });

    expect(productOf(account, milk)?.photoUrl).toBe('first.jpg');
  });

  it('undo reverses the count but keeps the Barcode remembered', async () => {
    const { account, barcodeLookup } = setup();
    const result = account.resolveScan(BEAR_BRAND, 'inventory', { name: 'Bear Brand Milk' });
    result.undo();

    expect(account.inventory()).toEqual([]);
    const again = await account.scan(BEAR_BRAND, 'inventory');
    expect(again).toMatchObject({ kind: 'applied', effect: 'countUp' });
    expect(barcodeLookup.asked).toEqual([]);
  });
});

describe('Barcode linking', () => {
  it('a Product can have many Barcodes, and each scans to it', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    account.linkBarcode(milk, '4800361000001');
    account.linkBarcode(milk, '4800361000002');

    await account.scan('4800361000001', 'inventory');
    await account.scan('4800361000002', 'inventory');

    expect(productOf(account, milk)).toMatchObject({
      count: 2,
      barcodes: ['4800361000001', '4800361000002'],
    });
  });

  it('a Barcode belongs to at most one Product: linking moves it', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    const coffee = addStocked(account, 'Coffee', 0);
    account.linkBarcode(milk, BEAR_BRAND);

    account.linkBarcode(coffee, BEAR_BRAND);
    await account.scan(BEAR_BRAND, 'inventory');

    expect(productOf(account, milk)).toMatchObject({ count: 0, barcodes: [] });
    expect(productOf(account, coffee)).toMatchObject({ count: 1, barcodes: [BEAR_BRAND] });
  });

  it('unlinkBarcode forgets the Barcode, so the next scan is unknown', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.linkBarcode(milk, BEAR_BRAND);

    account.unlinkBarcode(milk, BEAR_BRAND);

    expect(productOf(account, milk)?.barcodes).toEqual([]);
    expect(await account.scan(BEAR_BRAND, 'inventory')).toMatchObject({ kind: 'unknown' });
  });

  it('deleting a Product forgets its Barcodes', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 1);
    account.linkBarcode(milk, BEAR_BRAND);

    account.deleteProduct(milk);

    expect(await account.scan(BEAR_BRAND, 'inventory')).toMatchObject({ kind: 'unknown' });
  });

  it('a 12-digit UPC-A and its 13-digit EAN form are the same Barcode', async () => {
    const { account, barcodeLookup } = setup();
    const chips = addStocked(account, 'Chips', 0);
    account.linkBarcode(chips, '012345678905');

    await account.scan('0012345678905', 'inventory');
    await account.scan(' 012345678905 ', 'inventory');

    expect(productOf(account, chips)).toMatchObject({ count: 2, barcodes: ['0012345678905'] });
    expect(barcodeLookup.asked).toEqual([]);
  });

  it('looks up and reports unknown Barcodes in their 13-digit form', async () => {
    const { account, barcodeLookup } = setup();

    const result = await account.scan('012345678905', 'inventory');

    expect(result).toMatchObject({ kind: 'unknown', barcode: '0012345678905' });
    expect(barcodeLookup.asked).toEqual(['0012345678905']);
  });

  it('rejects a Barcode that is not digits', async () => {
    const { account } = setup();
    const milk = addStocked(account, 'Bear Brand Milk', 0);
    await expect(account.scan('', 'inventory')).rejects.toThrow();
    expect(() => account.linkBarcode(milk, 'abc')).toThrow();
  });
});
