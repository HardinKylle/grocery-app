import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../data/AccountProvider';
import { CountStepper, ExpiryLabel, ProductEditor } from './productParts';

export function InventoryScreen() {
  const { account, loaded } = useAccount();
  const [openId, setOpenId] = useState<string>();
  const products = account.inventory();

  return (
    <section>
      <h1>Inventory</h1>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : products.length === 0 ? (
        <p className="empty">
          Nothing at home yet. Add Products in the <Link to="/catalog">Catalog</Link>.
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
              {openId === product.id && <ProductEditor account={account} product={product} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
