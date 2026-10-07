# Grocery App

A private app where each person tracks the groceries they have at home and the groceries they plan to buy. Each person's data is their own and is never shared.

## Language

**Account**:
One person's own copy of the app, holding exactly one Inventory and one Shopping List. Nothing is shared between Accounts, including barcode names.
_Avoid_: Household, user profile

**Product**:
A grocery item defined in the Catalog: its name, Barcodes, photo, Price, and Low Stock Threshold. It may have one Inventory entry and one Shopping List entry.
_Avoid_: Item, entry

**Barcode**:
A code printed on packaging that identifies a Product. A Product can have zero, one, or many Barcodes; loose goods like vegetables have none.
_Avoid_: UPC, EAN, SKU

**Catalog**:
Every Product an Account has ever scanned or added. New Products are created here; counts are not managed here. A Product leaves the Catalog only when deleted.
_Avoid_: Products page, product list, history

**Inventory**:
The Products an Account has at home. Each has one Inventory entry holding a count of 1 or more in whole units and an optional Expiry Date; adding more of a Product raises that count.
_Avoid_: Stock, pantry list

**Shopping List**:
The Products an Account plans to buy on the next trip, each with a buy quantity (default 1). Only the person adds Products to it; nothing is added automatically. Checking a Product off adds its buy quantity to its Inventory count at once, and the Product stays crossed out until Done Shopping.
_Avoid_: Grocery list, to-buy list

**Done Shopping**:
The act that ends a trip and clears checked-off Products from the Shopping List. Products not checked off stay on it.
_Avoid_: Finish, checkout

## Stock levels

**Low Stock Threshold**:
An optional count set per Product, off by default. A Product whose count is at or below it is Low Stock.
_Avoid_: Reorder point, minimum

**Low Stock**:
A Product whose count is above 0 but at or below its Low Stock Threshold. It is flagged only and is never added to the Shopping List automatically.
_Avoid_: Running low, almost out

**Out of Stock**:
A Product whose count has dropped from 1 or more to 0. A Product that has never been at home is not Out of Stock. It is shown as Out of Stock, marked if already on the Shopping List, until it is restocked or dismissed, and it stays in the Catalog either way. It is never added to the Shopping List automatically.
_Avoid_: Empty, deleted

**Price**:
An optional, hand-entered amount in pesos per Product, used to show an estimated total for the Shopping List.
_Avoid_: Cost, SRP

**Expiry Date**:
An optional, hand-entered date per Product, set to the soonest-expiring unit at home. It clears when the count drops to 0.
_Avoid_: Best before, use-by

## Scanning

**Scan Mode**:
The chosen target for scans: add to Inventory or add to Shopping List.
_Avoid_: Scanner setting

## Reminders

**Shopping Day**:
The day of the week an Account plans to shop, used to time the shopping reminder.
_Avoid_: Grocery day, trip day
