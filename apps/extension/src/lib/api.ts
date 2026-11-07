import type { Alternative, PurchaseRequest } from '@resist/engine';
import type { BackendRequest, BackendResponse } from '../background';

/**
 * Calls the backend through the service worker. Resolves null on timeout, error or when
 * running outside the extension — callers always have a local fallback.
 */
export async function callBackend<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  const msg: BackendRequest = { type: 'backend', path, body, timeoutMs };
  const race = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs + 250));
  try {
    const res = (await Promise.race([chrome.runtime.sendMessage(msg), race])) as BackendResponse | null;
    return res && res.ok ? (res.data as T) : null;
  } catch {
    return null;
  }
}

/** A match as returned by /api/alternatives, before the engine adds saving + lowestIfChosen. */
export type RawAlternative = Pick<Alternative, 'title' | 'price' | 'seller' | 'condition' | 'url'>;

/**
 * Cheaper same-model option. Sends only the item title and price (never balance, bills or income).
 * TODO(thread 1): call POST /api/alternatives.
 */
export async function fetchAlternative(_req: Pick<PurchaseRequest, 'item' | 'price'>): Promise<RawAlternative | null> {
  return null;
}
