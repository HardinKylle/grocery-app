import { useState, type FormEvent } from 'react';
import { useAccount } from '../data/AccountProvider';
import type { Account, Product } from '../core/account';
import { formatPeso } from './productParts';

export function ShoppingListScreen() {
  const { account, loaded } = useAccount();
  const products = account.shoppingList();
  const checkedCount = products.filter((p) => p.shoppingList?.checkedOff).length;
  const estimate = account.shoppingListEstimate();

  return (
    <section>
      <h1>Shopping List</h1>
      <AddToListForm account={account} />

      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : products.length === 0 ? (
        <p className="empty">Your Shopping List is empty.</p>
      ) : (
        <>
          <ul className="products">
            {products.map((product) => (
              <ListEntry key={product.id} account={account} product={product} />
            ))}
          </ul>
          <p className="estimate" aria-live="polite">
            <span>Estimated total</span> <strong>{formatPeso(estimate.total)}</strong>
            {estimate.unpriced > 0 && (
              <span className="muted small">
                {' '}
                ({estimate.unpriced === 1 ? '1 entry has' : `${estimate.unpriced} entries have`} no
                Price)
              </span>
            )}
          </p>
          <button
            type="button"
            className="button-primary done-shopping"
            disabled={checkedCount === 0}
            onClick={() => account.doneShopping()}
          >
            Done Shopping{checkedCount > 0 ? ` (${checkedCount})` : ''}
          </button>
        </>
      )}
    </section>
  );
}

/** Type a name: picks the Catalog Product with that name, or makes a new one. */
function AddToListForm({ account }: { account: Account }) {
  const [name, setName] = useState('');
  const suggestions = account.catalog().filter((p) => !p.shoppingList);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    account.addToShoppingListByName(name);
    setName('');
  }

  return (
    <form className="add-product" onSubmit={submit}>
      <input
        aria-label="Add to Shopping List"
        placeholder="Add a Product"
        list="catalog-names"
        value={name}
        onChange={(e) => setName(e.target.value)}
        enterKeyHint="done"
        autoComplete="off"
      />
      <datalist id="catalog-names">
        {suggestions.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <button type="submit" className="button-primary" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

function ListEntry({ account, product }: { account: Account; product: Product }) {
  const entry = product.shoppingList!;
  const checked = entry.checkedOff;

  return (
    <li className={checked ? 'product checked' : 'product'}>
      <div className="product-row">
        <label className="check">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => (checked ? account.uncheck(product.id) : account.checkOff(product.id))}
            aria-label={`${checked ? 'Un-check' : 'Check off'} ${product.name}`}
          />
          <span className="product-name">
            <span className="list-name">{product.name}</span>
            <span className="muted small">{product.count} at home</span>
          </span>
        </label>
        <div className="stepper">
          <button
            type="button"
            className="step"
            aria-label={`Buy one less ${product.name}`}
            onClick={() => account.setBuyQuantity(product.id, entry.buyQuantity - 1)}
            disabled={checked || entry.buyQuantity <= 1}
          >
            −
          </button>
          <input
            key={entry.buyQuantity}
            className="count"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            aria-label={`Buy quantity of ${product.name}`}
            defaultValue={entry.buyQuantity}
            disabled={checked}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const raw = e.currentTarget.value.trim();
              if (raw === '') e.currentTarget.value = String(entry.buyQuantity);
              else account.setBuyQuantity(product.id, Number(raw));
            }}
          />
          <button
            type="button"
            className="step"
            aria-label={`Buy one more ${product.name}`}
            onClick={() => account.setBuyQuantity(product.id, entry.buyQuantity + 1)}
            disabled={checked}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="remove"
          aria-label={`Remove ${product.name} from the Shopping List`}
          onClick={() => account.removeFromShoppingList(product.id)}
        >
          ×
        </button>
      </div>
    </li>
  );
}
