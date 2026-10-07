import { useState, type FormEvent } from 'react';
import type { Account, IsoDate, Product } from '../core/account';
import { parsePrice, PRICE_ERROR } from '../core/price';

/** − [count] + controls. The count field can be typed into directly. */
export function CountStepper({ account, product }: { account: Account; product: Product }) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="step"
        aria-label={`One less ${product.name}`}
        onClick={() => account.decrement(product.id)}
        disabled={product.count === 0}
      >
        −
      </button>
      <input
        key={product.count}
        className="count"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        aria-label={`Count of ${product.name}`}
        defaultValue={product.count}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const raw = e.currentTarget.value.trim();
          if (raw === '') e.currentTarget.value = String(product.count);
          else account.setCount(product.id, Number(raw));
        }}
      />
      <button
        type="button"
        className="step"
        aria-label={`One more ${product.name}`}
        onClick={() => account.increment(product.id)}
      >
        +
      </button>
    </div>
  );
}

/** "Expires Oct 12", or "Expired Oct 5" once the day has passed. */
export function ExpiryLabel({ date }: { date: IsoDate }) {
  const expired = date < todayIso();
  return (
    <span className={expired ? 'expiry expired' : 'expiry'}>
      {expired ? 'Expired' : 'Expires'} {formatDay(date)}
    </span>
  );
}

/** The Open Food Facts photo, or the name's first letter when there is none. */
export function Thumbnail({ product }: { product: Product }) {
  if (product.photoUrl) {
    return <img className="thumb" src={product.photoUrl} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="thumb thumb-letter" aria-hidden="true">
      {product.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Inventory editor: the Expiry Date. Everything else is in the Catalog. */
export function InventoryEditor({ account, product }: { account: Account; product: Product }) {
  return (
    <div className="editor">
      <div className="field">
        <label htmlFor={`expiry-${product.id}`}>Expiry Date</label>
        <div className="row">
          <input
            id={`expiry-${product.id}`}
            type="date"
            value={product.expiryDate ?? ''}
            onChange={(e) => account.setExpiryDate(product.id, e.target.value || null)}
          />
          {product.expiryDate && (
            <button
              type="button"
              className="button-link"
              onClick={() => account.setExpiryDate(product.id, null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Catalog editor: name, Price, Barcodes, Low Stock Threshold, and delete. */
export function CatalogEditor({ account, product }: { account: Account; product: Product }) {
  const [name, setName] = useState(product.name);
  const [error, setError] = useState<string>();
  const [priceError, setPriceError] = useState<string>();

  function rename(e?: FormEvent) {
    e?.preventDefault();
    if (name.trim() === product.name) return;
    try {
      account.renameProduct(product.id, name);
      setError(undefined);
    } catch {
      setError('A Product needs a name.');
      setName(product.name);
    }
  }

  function savePrice(input: HTMLInputElement) {
    const price = parsePrice(input.value);
    try {
      if (price === undefined) throw new Error('Not a number');
      account.setPrice(product.id, price);
      setPriceError(undefined);
      input.value = price === null ? '' : String(price);
    } catch {
      setPriceError(PRICE_ERROR);
    }
  }

  function remove() {
    if (window.confirm(`Delete ${product.name} from the Catalog? This removes it everywhere.`)) {
      account.deleteProduct(product.id);
    }
  }

  return (
    <div className="editor">
      {product.photoUrl && (
        <img className="photo" src={product.photoUrl} alt="" referrerPolicy="no-referrer" />
      )}
      <form onSubmit={rename} className="field">
        <label htmlFor={`name-${product.id}`}>Name</label>
        <input
          id={`name-${product.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => rename()}
          enterKeyHint="done"
        />
      </form>
      {error && <p className="field-error">{error}</p>}

      <div className="field">
        <label htmlFor={`price-${product.id}`}>Price (₱)</label>
        <input
          id={`price-${product.id}`}
          key={product.price ?? 'none'}
          className="price-input"
          type="text"
          inputMode="decimal"
          placeholder="None"
          defaultValue={product.price ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => savePrice(e.currentTarget)}
        />
        {priceError ? (
          <p className="field-error">{priceError}</p>
        ) : (
          <p className="muted small">Leave empty for no Price.</p>
        )}
      </div>

      <BarcodeList account={account} product={product} />

      <div className="field">
        <label htmlFor={`threshold-${product.id}`}>Low Stock Threshold</label>
        <input
          id={`threshold-${product.id}`}
          key={product.lowStockThreshold ?? 'off'}
          className="threshold"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="Off"
          defaultValue={product.lowStockThreshold ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const raw = e.currentTarget.value.trim();
            account.setLowStockThreshold(product.id, raw === '' ? null : Number(raw));
            // Show what was kept (e.g. 0 turns it off, 2.7 becomes 2).
            e.currentTarget.value = String(
              account.catalog().find((p) => p.id === product.id)?.lowStockThreshold ?? '',
            );
          }}
        />
        <p className="muted small">Flag as Low Stock at or below this count. Leave empty for off.</p>
      </div>

      <button type="button" className="button-danger" onClick={remove}>
        Delete Product
      </button>
    </div>
  );
}

/** The Product's Barcodes, each with Unlink, plus a field to link one. */
function BarcodeList({ account, product }: { account: Account; product: Product }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();

  function link(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      account.linkBarcode(product.id, code);
      setCode('');
      setError(undefined);
    } catch {
      setError('A Barcode is 6 to 14 digits.');
    }
  }

  return (
    <div className="field">
      <span className="label">Barcodes</span>
      {product.barcodes.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <ul className="barcodes">
          {product.barcodes.map((barcode) => (
            <li key={barcode} className="row">
              <span className="barcode">{barcode}</span>
              <button
                type="button"
                className="button-link"
                aria-label={`Unlink Barcode ${barcode}`}
                onClick={() => account.unlinkBarcode(product.id, barcode)}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={link}>
        <input
          className="grow"
          aria-label={`Link a Barcode to ${product.name}`}
          placeholder="Type a Barcode to link"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="button-secondary" disabled={!code.trim()}>
          Link
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
      <p className="muted small">Linking moves the Barcode off any other Product.</p>
    </div>
  );
}

function todayIso(): IsoDate {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDay(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
