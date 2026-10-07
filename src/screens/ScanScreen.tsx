import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccount } from '../data/AccountProvider';
import type { Account, ScanApplied, ScanMode, ScanUnknown } from '../core/account';
import { useBarcodeCamera, warmUpDecoder } from '../scan/useBarcodeCamera';

const MODE_KEY = 'grocery.scanMode';
const TOAST_MS = 5000;

type Toast = { id: number; text: string; undo?: () => void };
type Pending = ScanUnknown & { mode: ScanMode };

export function ScanScreen() {
  const { account } = useAccount();
  const [mode, setMode] = useState<ScanMode>(readMode);
  const [toast, setToast] = useState<Toast>();
  const [pending, setPending] = useState<Pending>();
  const [lookingUp, setLookingUp] = useState(false);
  const busy = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(warmUpDecoder, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function chooseMode(next: ScanMode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  function showApplied(result: ScanApplied) {
    setToast({ id: Date.now(), text: toastText(result), undo: result.undo });
  }

  async function handleCode(code: string) {
    // One scan at a time; ignore the camera while a name is being chosen.
    if (busy.current) return;
    busy.current = true;
    setLookingUp(true);
    try {
      const result = await account.scan(code, mode);
      if (result.kind === 'applied') {
        showApplied(result);
        busy.current = false;
      } else {
        setPending({ ...result, mode });
      }
    } catch {
      setToast({ id: Date.now(), text: `Not a Barcode: ${code}` });
      busy.current = false;
    } finally {
      setLookingUp(false);
    }
  }

  function finish(result?: ScanApplied) {
    if (result) showApplied(result);
    setPending(undefined);
    busy.current = false;
  }

  const camera = useBarcodeCamera(videoRef, (code) => void handleCode(code));

  return (
    <section className="scan">
      <h1>Scan</h1>

      <div className="mode-switch" role="radiogroup" aria-label="Scan Mode">
        <ModeButton mode="inventory" current={mode} onChoose={chooseMode}>
          Add to Inventory
        </ModeButton>
        <ModeButton mode="shoppingList" current={mode} onChoose={chooseMode}>
          Add to Shopping List
        </ModeButton>
      </div>

      <div className="viewfinder">
        <video ref={videoRef} playsInline muted autoPlay />
        {camera.state !== 'on' && (
          <div className="viewfinder-cover">
            {camera.state === 'denied' ? (
              <p>Camera is blocked. Allow it in Settings &gt; Safari &gt; Camera, then try again.</p>
            ) : camera.state === 'unavailable' ? (
              <p>No camera available. Type the Barcode digits below.</p>
            ) : null}
            <button
              type="button"
              className="button-primary"
              disabled={camera.state === 'starting'}
              onClick={() => void camera.start()}
            >
              {camera.state === 'starting' ? 'Starting…' : 'Start scanning'}
            </button>
          </div>
        )}
      </div>
      {camera.state === 'on' && (
        <button type="button" className="button-secondary stop-camera" onClick={camera.stop}>
          Stop camera
        </button>
      )}
      {lookingUp && <p className="muted small">Looking up…</p>}

      <ManualEntry onSubmit={(code) => void handleCode(code)} />

      {pending && (
        <UnknownBarcode account={account} pending={pending} onDone={finish} />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="button-link"
              onClick={() => {
                toast.undo?.();
                setToast(undefined);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ModeButton({
  mode,
  current,
  onChoose,
  children,
}: {
  mode: ScanMode;
  current: ScanMode;
  onChoose: (mode: ScanMode) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={mode === current}
      className={mode === current ? 'mode selected' : 'mode'}
      onClick={() => onChoose(mode)}
    >
      {children}
    </button>
  );
}

/** Fallback when the camera can't read a code: type the digits. */
function ManualEntry({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    onSubmit(code);
    setCode('');
  }

  return (
    <form className="add-product manual-entry" onSubmit={submit}>
      <input
        aria-label="Barcode digits"
        placeholder="Type Barcode digits"
        inputMode="numeric"
        pattern="[0-9]*"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        enterKeyHint="done"
        autoComplete="off"
      />
      <button type="submit" className="button-secondary" disabled={!code.trim()}>
        Enter
      </button>
    </form>
  );
}

/**
 * An unknown Barcode: confirm or edit the Open Food Facts name, type one,
 * or link the Barcode to an existing Product.
 */
function UnknownBarcode({
  account,
  pending,
  onDone,
}: {
  account: Account;
  pending: Pending;
  onDone: (result?: ScanApplied) => void;
}) {
  const [name, setName] = useState(pending.suggestion?.name ?? '');
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState('');
  const photoUrl = pending.suggestion?.photoUrl ?? null;

  function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onDone(account.resolveScan(pending.barcode, pending.mode, { name, photoUrl }));
  }

  function link(productId: string) {
    onDone(account.resolveScan(pending.barcode, pending.mode, { productId, photoUrl }));
  }

  const message = {
    found: 'Found on Open Food Facts. Check the name.',
    notFound: 'Not on Open Food Facts. Type a name.',
    offline: 'No signal, so no lookup. Type a name.',
    unavailable: 'Open Food Facts is busy right now. Type a name.',
  }[pending.lookup];

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="New Barcode">
        <h2>New Barcode</h2>
        <p className="muted small">
          {pending.barcode} · {message}
        </p>

        {!linking ? (
          <>
            <form className="editor" onSubmit={save}>
              <div className="row">
                {photoUrl && <img className="photo" src={photoUrl} alt="" referrerPolicy="no-referrer" />}
                <div className="field grow">
                  <label htmlFor="scan-name">Name</label>
                  <input
                    id="scan-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus={!name}
                    enterKeyHint="done"
                    autoComplete="off"
                  />
                </div>
              </div>
              <button type="submit" className="button-primary" disabled={!name.trim()}>
                Save {pending.mode === 'inventory' ? 'and add 1' : 'to Shopping List'}
              </button>
            </form>
            <button type="button" className="button-secondary" onClick={() => setLinking(true)}>
              Link to an existing Product
            </button>
          </>
        ) : (
          <>
            <input
              className="search"
              type="search"
              aria-label="Search the Catalog"
              placeholder="Search the Catalog"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <ul className="products link-list">
              {account.catalog(search).map((product) => (
                <li key={product.id} className="product">
                  <button type="button" className="product-name" onClick={() => link(product.id)}>
                    <span>{product.name}</span>
                    <span className="muted small">Count {product.count}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="button-link" onClick={() => setLinking(false)}>
              Back
            </button>
          </>
        )}

        <button type="button" className="button-link" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function toastText({ effect, product }: ScanApplied): string {
  switch (effect) {
    case 'countUp':
      return `+1 ${product.name}`;
    case 'addedToList':
      return `${product.name} added to Shopping List`;
    case 'buyQuantityUp':
      return `+1 ${product.name} on Shopping List (buy ${product.shoppingList?.buyQuantity})`;
    case 'alreadyCheckedOff':
      return `${product.name} is already checked off`;
  }
}

function readMode(): ScanMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'shoppingList' ? 'shoppingList' : 'inventory';
  } catch {
    return 'inventory';
  }
}
