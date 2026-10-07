# Grocery App v1

Labels: `ready-for-agent`

## Problem Statement

I keep forgetting what groceries I already have at home and what I need to buy. Notes apps don't know counts, so I buy things I already have and run out of things I didn't notice. Typing every item by hand is slow, so I stop logging after a few days. In the store the signal is often bad, so an online-only list fails right when I need it. My girlfriend has the same problem but wants her own separate data.

## Solution

A private web app added to the iPhone Home Screen. Each person has their own Account with one Inventory (what's at home, with counts) and one Shopping List (what to buy next). A barcode scanner adds Products in one step, using Open Food Facts for the name or remembering the name I type the first time. Every Product I've ever added stays in my Catalog, so I can put it back on the Shopping List later. The Inventory flags Low Stock and Out of Stock Products, but only I decide what goes on the Shopping List. The Shopping List works offline. Push notifications warn me about Expiry Dates and remind me on my Shopping Day.

## User Stories

### Account and access

1. As an Account owner, I want to sign in with my Google account, so that I don't need another password.
2. As an Account owner, I want only my email and my girlfriend's email to be allowed in, so that strangers can't use the app.
3. As an Account owner, I want my data to be completely separate from the other Account, so that her Inventory and mine never mix.
4. As an Account owner, I want my barcode names kept private to my Account, so that nothing I type shows up in hers.
5. As an Account owner, I want to stay signed in on the Home Screen app, so that I don't sign in every time I open it.
6. As an Account owner, I want to sign out, so that I can switch phones or hand mine to someone.
7. As an iPhone user, I want to add the app to my Home Screen, so that it opens like a normal app.

### Catalog and Products

8. As an Account owner, I want a Catalog listing every Product I've ever scanned or added, so that I never lose a Product I bought before.
9. As an Account owner, I want to search the Catalog by name, so that I can find a Product quickly.
10. As an Account owner, I want to add a Product by typing its name, so that I can track loose goods like vegetables that have no Barcode.
11. As an Account owner, I want to edit a Product's name, so that I can fix a bad name from Open Food Facts or a typo.
12. As an Account owner, I want a Product to hold zero, one, or many Barcodes, so that different sizes or packaging of the same thing count as one Product.
13. As an Account owner, I want to link a new Barcode to an existing Product, so that Bear Brand 300g and 150g both count as "Bear Brand Milk".
14. As an Account owner, I want to remove a Barcode from a Product, so that I can fix a wrong link.
15. As an Account owner, I want to see a Product photo when Open Food Facts has one, so that I can recognize Products at a glance.
16. As an Account owner, I want to delete a Product from the Catalog, so that Products I'll never buy again stop cluttering it.
17. As an Account owner, I want deleting a Product to also forget its Barcodes, so that scanning it again starts fresh.
18. As an Account owner, I want to add any Catalog Product to the Shopping List, so that I can plan to rebuy it.
19. As an Account owner, I want to see each Product's count in the Catalog, so that I know whether I have it.

### Inventory

20. As an Account owner, I want the Inventory to show only the Products I have at home (count 1 or more), so that it stays short and true.
21. As an Account owner, I want counts in whole units, so that logging stays simple.
22. As an Account owner, I want a plus button on each Inventory Product, so that I can add one without scanning.
23. As an Account owner, I want a minus button on each Inventory Product, so that I can log using one up.
24. As an Account owner, I want to set a count directly, so that I can fix it after unpacking many of the same thing.
25. As an Account owner, I want to add a Catalog Product to the Inventory with a count, so that I can log things I already had before I started using the app.

### Low Stock and Out of Stock

26. As an Account owner, I want to set an optional Low Stock Threshold per Product, off by default, so that I'm only warned about the Products I care about.
27. As an Account owner, I want a Product flagged Low Stock when its count is at or below its threshold, so that I can restock before it runs out.
28. As an Account owner, I want Products with no threshold never to be flagged Low Stock, so that a single bag of rice isn't marked low.
29. As an Account owner, I want a Low Stock section at the bottom of the Inventory, so that I see what's running low in one place.
30. As an Account owner, I want a Product that drops from 1 or more to 0 to show in an Out of Stock section at the bottom of the Inventory, so that I notice it ran out.
31. As an Account owner, I want a Product that was never at home not to show as Out of Stock, so that new Products I only plan to buy aren't mistaken for ones that ran out.
32. As an Account owner, I want an "add to Shopping List" button on Low Stock and Out of Stock Products, so that restocking takes one tap.
33. As an Account owner, I want a "dismiss" button on Out of Stock Products, so that I can hide ones I don't plan to rebuy.
34. As an Account owner, I want dismissed Products to stay in the Catalog, so that I can still find and rebuy them later.
35. As an Account owner, I want nothing added to the Shopping List automatically, so that the list only holds things I chose.

### Shopping List

36. As an Account owner, I want one Shopping List, so that I always know where to look.
37. As an Account owner, I want to add a Product to the Shopping List by typing a name, so that I can plan to buy something I've never had.
38. As an Account owner, I want typing a new name on the Shopping List to create a Catalog Product at count 0, so that it's remembered after I buy it.
39. As an Account owner, I want a buy quantity on each Shopping List entry, defaulting to 1, so that I can plan to buy 3 of something.
40. As an Account owner, I want to change the buy quantity, so that I can adjust my plan.
41. As an Account owner, I want to remove a Product from the Shopping List without buying it, so that I can change my mind.
42. As a shopper, I want checking off a Product to add its buy quantity to its Inventory count right away, so that my Inventory is current the moment I grab it.
43. As a shopper, I want a checked-off Product to stay crossed out instead of vanishing, so that I can undo a mis-tap mid-trip.
44. As a shopper, I want to un-check a Product, so that a mis-tap reverses its Inventory count change.
45. As a shopper, I want a Done Shopping button that clears checked-off Products, so that the list is clean for next time.
46. As a shopper, I want Products I didn't check off to stay on the list after Done Shopping, so that things the store didn't have carry over.
47. As a shopper, I want the Shopping List sorted by name, so that it's easy to scan by eye.

### Scanning

48. As an Account owner, I want to scan a Barcode with my iPhone camera from inside the Home Screen app, so that logging is fast.
49. As an Account owner, I want a Scan Mode switch for "add to Inventory" or "add to Shopping List", so that I can scan a whole bag in a row without choosing each time.
50. As an Account owner, I want my last Scan Mode remembered, so that I don't reset it each time.
51. As an Account owner, I want scanning a known Barcode in Inventory mode to add 1 right away, so that unpacking groceries is quick.
52. As an Account owner, I want a toast like "+1 Bear Brand Milk" with an Undo after each scan, so that I can confirm and fix mistakes.
53. As an Account owner, I want scanning a known Barcode in Shopping List mode to add the Product to the list, or add 1 to its buy quantity if it's already there, so that repeat scans mean "more".
54. As an Account owner, I want an unknown Barcode looked up on Open Food Facts, so that I usually don't have to type a name.
55. As an Account owner, I want to confirm or edit the suggested name for an unknown Barcode, so that names are right before they're saved.
56. As an Account owner, I want to link an unknown Barcode to an existing Product instead of making a new one, so that sizes and variants stay as one Product.
57. As an Account owner, I want to type a name myself when Open Food Facts has nothing, so that local Philippine brands still work.
58. As an Account owner, I want a Barcode remembered after the first time, so that the next scan of it needs no lookup.
59. As an Account owner, I want to type the name right away when I scan an unknown Barcode offline, so that scanning works in a store with no signal.
60. As an Account owner, I want known Barcodes to work offline, so that scanning in the store works.

### Expiry Dates

61. As an Account owner, I want to set an optional Expiry Date on a Product, so that I can be warned before it spoils.
62. As an Account owner, I want one Expiry Date per Product, set to the soonest one, so that tracking stays simple.
63. As an Account owner, I want the Expiry Date cleared when the count drops to 0, so that old dates don't linger.
64. As an Account owner, I want to see the Expiry Date on the Product in the Inventory, so that I know what to use first.

### Notifications and settings

65. As an Account owner, I want to turn on push notifications from inside the Home Screen app, so that I get alerts on my iPhone.
66. As an Account owner, I want a daily expiry alert at my notification time listing Products expiring within my chosen number of days (default 2), including ones already expired, so that I use them in time.
67. As an Account owner, I want no expiry alert on days when nothing is expiring, so that I'm not pinged for nothing.
68. As an Account owner, I want to set my Shopping Day, so that the reminder comes on the day I shop.
69. As an Account owner, I want one Shopping Day message at my notification time with my Shopping List count and my Low Stock, Out of Stock, and expiring Products, so that I get one summary before I shop.
70. As an Account owner, I want to set my notification time (default 8:00 AM, Philippine time), so that alerts arrive when I want.
71. As an Account owner, I want to set how many days before expiry I'm warned, so that the alert fits my habits.
72. As an Account owner, I want tapping a notification to open the relevant screen, so that I can act on it right away.

### Offline

73. As a shopper, I want the Shopping List to load with no signal, so that I can shop in a dead zone.
74. As a shopper, I want to check off Products with no signal, so that the trip isn't blocked.
75. As a shopper, I want offline changes to sync when I'm back online, so that nothing is lost.
76. As an Account owner, I want the Inventory and Catalog readable offline, so that I can check what's at home from anywhere.

## Implementation Decisions

- **Platform**: React + Vite static PWA on Firebase Hosting. It's installable on the iOS Home Screen with a web app manifest and service worker. See ADR 0001.
- **Backend**: Firebase Auth (Google provider), Firestore with offline persistence turned on, Firebase Cloud Messaging for web push, and Cloud Functions on the Blaze plan with a $1 budget alert. See ADR 0001.
- **Access control**: an allow-list of two emails, enforced in Firestore security rules (not just in the UI). All Account data lives under that Account's own path. Rules allow access only when the signed-in user owns that path and their email is on the allow-list.
- **Account core module** (the main test seam): a pure domain module holding every rule in `GLOSSARY.md`. It has no UI or Firebase code inside it.
  - Commands: scan(barcode, scanMode), addProductByName, setCount, increment, decrement, addToShoppingList, removeFromShoppingList, setBuyQuantity, checkOff, uncheck, doneShopping, dismissOutOfStock, deleteProduct, linkBarcode, unlinkBarcode, renameProduct, setLowStockThreshold, setExpiryDate.
  - Queries: inventory, shoppingList, catalog, lowStock, outOfStock, dueNotifications(now, settings).
  - Ports: a storage port (Firestore adapter in the app, in-memory fake in tests), a barcode lookup port (Open Food Facts adapter, fake in tests), and a clock port.
- **Product data**: name, Barcodes (zero or more), count (whole number, at least 0), optional Low Stock Threshold, optional Expiry Date, optional photo URL (from Open Food Facts only, no camera upload), whether it was ever at home or is Out of Stock, whether it's dismissed, and Shopping List state (on list, buy quantity, checked off).
- **Out of Stock rule**: set only when a count goes from 1 or more down to 0. A Product created at 0 is not Out of Stock. Dismissing hides it from the section. Adding stock again clears the Out of Stock flag and the dismissed flag.
- **Low Stock rule**: a threshold is set and 0 < count ≤ threshold. Flag only.
- **No auto-add**: no rule anywhere puts a Product on the Shopping List without a direct user action.
- **Check-off**: adds the buy quantity to the count right away. Un-check subtracts it. Done Shopping removes checked entries and leaves unchecked ones.
- **Expiry Date**: cleared when the count reaches 0.
- **Barcode lookup order**: first the Account's own Barcodes, then Open Food Facts, then manual entry. When offline, skip Open Food Facts and go straight to manual entry. A Barcode belongs to at most one Product per Account. Barcodes are never shared between Accounts.
- **Scanner**: a JS barcode library (zxing family), because Safari has no built-in BarcodeDetector. The camera is opened from inside the standalone Home Screen app.
- **Scheduled notifications**: one Cloud Function runs every hour. For each Account whose notification time falls in that hour (Asia/Manila), it calls the core's dueNotifications and sends at most one expiry alert and, on Shopping Day, one Shopping Day message through FCM. The Shopping Day message includes the list count, Low Stock, Out of Stock, and expiring Products.
- **Settings per Account**: Shopping Day (weekday), notification time (default 08:00), expiry lead days (default 2), and FCM device tokens.
- **Push on iOS**: needs the app added to the Home Screen and iOS 16.4 or later. The permission prompt is triggered by a user tap in Settings.

## Testing Decisions

- Good tests check behavior you can see from outside: give commands to the Account core, then assert on query results. Don't assert on internal structure or storage layout.
- **Seam 1: Account core**, tested with an in-memory storage fake, a fake barcode lookup, and a fake clock. This covers every rule: Out of Stock vs never had, Low Stock at or below the threshold, no auto-add, check-off and un-check arithmetic, Done Shopping carryover, scan behavior in each Scan Mode (known, unknown with a lookup hit, unknown with a lookup miss, offline), Barcode linking, delete forgetting Barcodes, Expiry Date clearing at 0, and dueNotifications for expiry windows and Shopping Day.
- **Seam 2: Firestore security rules**, tested with the Firebase emulator. Covers: a non-allow-listed email is denied, one Account cannot read or write the other's data, and an allow-listed owner can read and write their own data.
- Not automated: the camera scanner, UI layout, PWA install, and push delivery. These are checked by hand on an iPhone.
- Prior art: none, since the repo is new. These tests set the pattern.

## Out of Scope

- Shared households or shared lists between Accounts
- Sharing barcode names between Accounts
- Multiple Shopping Lists or Inventory locations (fridge, pantry)
- Categories or aisle grouping
- Amounts with units (kg, L) or partial quantities
- Expiry Dates per batch
- A "used one" Scan Mode
- Automatically adding Products to the Shopping List
- Queuing offline unknown-Barcode lookups for later
- Uploading photos from the camera
- Public sign-up
- Price tracking
- Native iOS or Android apps

## Further Notes

- Domain terms are defined in `GLOSSARY.md`. Use them in code and UI.
- ADR 0001 records the Firebase and Blaze choice and the GitHub Actions alternative that was rejected.
- Open Food Facts coverage of Philippine local brands is thin. The Account's own Barcode memory is expected to handle most scans after a few weeks.
- Budget alerts only warn and do not cap spending.
