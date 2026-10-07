import { useState, type FormEvent } from 'react';
import { normalizeBarcode, type Account, type Product } from '../core/account';
import { useAccount } from '../data/AccountProvider';
import { formatPeso, parsePrice, PRICE_ERROR } from '../core/price';
import { CatalogEditor, Thumbnail } from './productParts';

export function CatalogScreen() {
  const { account, loaded } = useAccount();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string>();
  const [addingId, setAddingId] = useState<string>();
  const products = account.catalog(search);
  const adding = addingId ? account.catalog().find((p) => p.id === addingId) : undefined;

  return (
    <section>
      <h1>Catalog</h1>
      <AddProductForm account={account} />

      <input
        className="search"
        type="search"
        placeholder="Search the Catalog"
        aria-label="Search the Catalog"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : products.length === 0 ? (
        <p className="empty">{search.trim() ? 'No Products match.' : 'No Products yet.'}</p>
      ) : (
        <ul className="products">
          {products.map((product) => (
            <li key={product.id} className="product">
              <div className="product-row">
                <Thumbnail product={product} />
                <button
                  type="button"
                  className="product-name"
                  aria-expanded={openId === product.id}
                  onClick={() => setOpenId(openId === product.id ? undefined : product.id)}
                >
                  <span>{product.name}</span>
                  <span className="muted small">
                    {product.price === null ? 'No Price' : formatPeso(product.price)}
                  </span>
                </button>
                <button
                  type="button"
                  className="step"
                  aria-label={`Add ${product.name} to Inventory or Shopping List`}
                  onClick={() => setAddingId(product.id)}
                >
                  +
                </button>
              </div>
              {openId === product.id && <CatalogEditor account={account} product={product} />}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddSheet account={account} product={adding} onClose={() => setAddingId(undefined)} />
      )}
    </section>
  );
}

/** Name, optional Price, optional Barcode. Creates the Product at count 0. */
function AddProductForm({ account }: { account: Account }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const parsed = parsePrice(price);
    if (parsed === undefined) {
      setError(PRICE_ERROR);
      return;
    }
    const code = barcode.trim() || null;
    if (code !== null) {
      try {
        normalizeBarcode(code);
      } catch {
        setError('A Barcode is 6 to 14 digits.');
        return;
      }
    }
    try {
      account.addProduct({ name, price: parsed, barcode: code });
    } catch {
      setError(PRICE_ERROR);
      return;
    }
    setName('');
    setPrice('');
    setBarcode('');
    setError(undefined);
  }

  return (
    <form className="add-product-form" onSubmit={submit}>
      <input
        aria-label="New Product name"
        placeholder="Add a Product"
        value={name}
        onChange={(e) => setName(e.target.value)}
        enterKeyHint="next"
      />
      <div className="row">
        <input
          aria-label="Price in pesos (optional)"
          className="grow"
          placeholder="Price ₱ (optional)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          aria-label="Barcode (optional)"
          className="grow"
          placeholder="Barcode (optional)"
          inputMode="numeric"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
        <button type="submit" className="button-primary" disabled={!name.trim()}>
          Add
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}

/** The + choice: Add to Inventory (count, Expiry Date) or Add to Shopping List (buy quantity). */
function AddSheet({
  account,
  product,
  onClose,
}: {
  account: Account;
  product: Product;
  onClose(): void;
}) {
  const [target, setTarget] = useState<'inventory' | 'shoppingList'>();
  const [quantity, setQuantity] = useState('1');
  // Already at home: show the current Expiry Date for editing.
  const [expiry, setExpiry] = useState(product.count > 0 ? (product.expiryDate ?? '') : '');
  const entry = product.shoppingList;

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(quantity);
    if (!Number.isFinite(n) || n < 1) return;
    if (target === 'inventory') account.addToInventory(product.id, n, expiry || null);
    else account.addToShoppingList(product.id, n);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{product.name}</h2>
        {!target ? (
          <>
            <button
              type="button"
              className="button-primary"
              onClick={() => setTarget('inventory')}
            >
              Add to Inventory
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={entry?.checkedOff}
              onClick={() => setTarget('shoppingList')}
            >
              Add to Shopping List
            </button>
            {entry?.checkedOff && (
              <p className="muted small">Checked off on the Shopping List until Done Shopping.</p>
            )}
            <button type="button" className="button-link" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : (
          <form className="editor" onSubmit={submit}>
            <p className="muted small">
              {target === 'inventory'
                ? product.count > 0
                  ? `${product.count} at home. This adds to it.`
                  : 'Not at home yet.'
                : entry
                  ? `On the Shopping List (buy ${entry.buyQuantity}). This adds to it.`
                  : 'Not on the Shopping List yet.'}
            </p>
            <div className="field">
              <label htmlFor="add-quantity">
                {target === 'inventory' ? 'Count' : 'Buy quantity'}
              </label>
              <input
                id="add-quantity"
                className="count"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantity}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {target === 'inventory' && (
              <div className="field">
                <label htmlFor="add-expiry">Expiry Date (optional)</label>
                <div className="row">
                  <input
                    id="add-expiry"
                    type="date"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                  {expiry && (
                    <button type="button" className="button-link" onClick={() => setExpiry('')}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
            <button
              type="submit"
              className="button-primary"
              disabled={!(Number(quantity) >= 1)}
            >
              {target === 'inventory' ? 'Add to Inventory' : 'Add to Shopping List'}
            </button>
            <button type="button" className="button-link" onClick={() => setTarget(undefined)}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
