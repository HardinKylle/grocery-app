import { useState, type FormEvent } from 'react';
import type { Account, IsoDate, Product } from '../core/account';

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

/** Rename, Expiry Date, and delete for one Product. */
export function ProductEditor({ account, product }: { account: Account; product: Product }) {
  const [name, setName] = useState(product.name);
  const [error, setError] = useState<string>();

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

  function remove() {
    if (window.confirm(`Delete ${product.name} from the Catalog? This removes it everywhere.`)) {
      account.deleteProduct(product.id);
    }
  }

  return (
    <div className="editor">
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
        <label htmlFor={`expiry-${product.id}`}>Expiry Date</label>
        {product.count > 0 ? (
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
        ) : (
          <p className="muted small">Add stock to set an Expiry Date.</p>
        )}
      </div>

      <button type="button" className="button-danger" onClick={remove}>
        Delete Product
      </button>
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
