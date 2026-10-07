import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
// Self-hosted so scanning works offline: Vite emits the wasm into dist and
// the service worker precaches it (globPatterns includes wasm). Without
// this, zxing-wasm fetches it from a CDN on first use.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const overrides = {
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
};
prepareZXingModule({ overrides });

// Retail codes only: faster, and fewer false reads.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const TICK_MS = 150;
/** The same code is ignored for this long, so one hold gives one scan. */
const REPEAT_MS = 1500;

export type CameraState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable';

/**
 * Runs the camera into `videoRef` and calls `onCode` for each Barcode seen.
 * Safari has no BarcodeDetector, so this uses the ZXing WASM ponyfill.
 * The camera must first be started from a tap on iOS. It stops when the
 * screen unmounts or the app is hidden (green dot, battery).
 */
export function useBarcodeCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  onCode: (code: string) => void,
) {
  const [state, setState] = useState<CameraState>('off');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const session = useRef<{ stop(): void } | null>(null);

  const stop = useCallback(() => {
    session.current?.stop();
    session.current = null;
    setState('off');
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    const video = videoRef.current;
    if (!video) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    setState('starting');

    let running = true;
    let stream: MediaStream | null = null;
    const current = {
      stop() {
        running = false;
        stream?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      },
    };
    session.current = current;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // ideal, not exact: exact throws on devices without a back camera.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!running) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
    } catch (error) {
      current.stop();
      if (session.current === current) session.current = null;
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      return;
    }
    setState('on');

    const detector = new BarcodeDetector({ formats: [...FORMATS] });
    let last = { code: '', at: 0 };
    const tick = async () => {
      if (!running) return;
      try {
        if (video.readyState >= 2) {
          const [hit] = await detector.detect(video);
          const now = Date.now();
          if (hit && running && (hit.rawValue !== last.code || now - last.at > REPEAT_MS)) {
            last = { code: hit.rawValue, at: now };
            onCodeRef.current(hit.rawValue);
          }
        }
      } catch (error) {
        console.error('Barcode detect failed', error);
      }
      if (running) setTimeout(tick, TICK_MS);
    };
    void tick();
  }, [videoRef]);

  // Stop when hidden; the owner taps Start again on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      session.current?.stop();
      session.current = null;
    };
  }, [stop]);

  return { state, start, stop };
}

/** Starts loading the decoder early, e.g. when the Scan screen opens. */
export function warmUpDecoder() {
  prepareZXingModule({ overrides, fireImmediately: true }).catch((error: unknown) => console.error('Decoder failed to load', error));
}
