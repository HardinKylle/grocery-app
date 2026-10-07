import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Account, Product } from '../core/account';
import { useAccount } from '../data/AccountProvider';
import { CountStepper, ExpiryLabel, InventoryEditor } from './productParts';

export function InventoryScreen() {
  const { account, loaded } = useAccount();
  const [openId, setOpenId] = useState<string>();
  const products = account.inventory();
  const lowStock = account.lowStock();
  const outOfStock = account.outOfStock();

  return (
    <section>
      <h1>Inventory</h1>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {products.length === 0 ? (
            <p className="empty">
              Nothing at home yet. Use + on a Product in the <Link to="/catalog">Catalog</Link>.
            </p>
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
                  {openId === product.id && <InventoryEditor account={account} product={product} />}
                </li>
              ))}
            </ul>
          )}

          {lowStock.length > 0 && (
            <StockSection title="Low Stock">
              {lowStock.map((product) => (
                <li key={product.id} className="product">
                  <div className="product-row">
                    <span className="product-name">
                      <span>{product.name}</span>
                      <span className="muted small">{product.count} left</span>
                    </span>
                    <AddToListButton account={account} product={product} />
                  </div>
                </li>
              ))}
            </StockSection>
          )}

          {outOfStock.length > 0 && (
            <StockSection title="Out of Stock">
              {outOfStock.map((product) => (
                <li key={product.id} className="product">
                  <div className="product-row">
                    <span className="product-name">{product.name}</span>
                    <AddToListButton account={account} product={product} />
                    <button
                      type="button"
                      className="button-link"
                      aria-label={`Dismiss ${product.name}`}
                      onClick={() => account.dismissOutOfStock(product.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </StockSection>
          )}
        </>
      )}
    </section>
  );
}

function StockSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stock-section" aria-label={title}>
      <h2>{title}</h2>
      <ul className="products">{children}</ul>
    </section>
  );
}

function AddToListButton({ account, product }: { account: Account; product: Product }) {
  if (product.shoppingList) return <span className="muted small">On list</span>;
  return (
    <button
      type="button"
      className="button-secondary stock-add"
      aria-label={`Add ${product.name} to Shopping List`}
      onClick={() => account.addToShoppingList(product.id)}
    >
      Add to list
    </button>
  );
}
