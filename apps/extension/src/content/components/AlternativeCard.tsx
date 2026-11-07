import type { Alternative, PurchaseRequest } from '@resist/engine';

interface Props {
  alternative: Alternative | null;
  loading: boolean;
  req: PurchaseRequest;
}

/** Cheaper same-model option card. TODO(thread 1). */
export function AlternativeCard(_props: Props) {
  return null;
}
