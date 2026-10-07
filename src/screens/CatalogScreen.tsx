import { useState, type FormEvent } from 'react';
import { useAccount } from '../data/AccountProvider';
import { CountStepper, ExpiryLabel, ProductEditor } from './productParts';

export function CatalogScreen() {
  const { account, loaded } = useAccount();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string>();
  const products = account.catalog(search);

  return (
    <section>
      <h1>Catalog</h1>
      <AddProductForm onAdd={(name, count) => account.addProductByName(name, count)} />

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
                <button
                  type="button"
                  className="product-name"
                  aria-expanded={openId === product.id}
                  onClick={() => setOpenId(openId === product.id ? undefined : product.id)}
                >
                  <span>{product.name}</span>
                  {product.expiryDate && <ExpiryLabel date={product.expiryDate} />}
                </button>
                <CountStepper account={account} product={product} />
              </div>
              {openId === product.id && <ProductEditor account={account} product={product} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddProductForm({ onAdd }: { onAdd(name: string, count: number): void }) {
  const [name, setName] = useState('');
  const [count, setCount] = useState('1');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name, Number(count) || 0);
    setName('');
    setCount('1');
  }

  return (
    <form className="add-product" onSubmit={submit}>
      <input
        aria-label="New Product name"
        placeholder="Add a Product"
        value={name}
        onChange={(e) => setName(e.target.value)}
        enterKeyHint="done"
      />
      <input
        aria-label="Count"
        className="count"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <button type="submit" className="button-primary" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
