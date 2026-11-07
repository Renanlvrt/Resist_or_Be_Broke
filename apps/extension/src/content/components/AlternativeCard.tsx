import { gbp, round2, type Alternative, type PurchaseRequest } from '@resist/engine';
import { modelName } from '../../lib/api';

interface Props {
  alternative: Alternative | null;
  loading: boolean;
  req: PurchaseRequest;
}

/** The two lines of copy, kept pure so they can be tested. */
export function alternativeCopy(alternative: Alternative, req: Pick<PurchaseRequest, 'item'>): [string, string] {
  const used = alternative.condition && alternative.condition !== 'new' ? ` (${alternative.condition})` : '';
  // The purchase lands today, so every forecast point shifts by the same amount:
  // lowest with the original = lowest with the cheaper one − the saving.
  const lowestWithOriginal = round2(alternative.lowestIfChosen - alternative.saving);
  return [
    `Same ${modelName(req.item)}, ${gbp(alternative.price)} at ${alternative.seller}${used}. ` +
      `Saves ${gbp(alternative.saving)}. Check the listing before you buy.`,
    `Leaves you ${gbp(alternative.lowestIfChosen)} before payday instead of ${gbp(lowestWithOriginal)}.`,
  ];
}

/** Cheaper same-model option card. Renders nothing once the search is done and found nothing. */
export function AlternativeCard({ alternative, loading, req }: Props) {
  if (!alternative) {
    if (!loading) return null;
    return (
      <p className="rob-alt-loading" aria-live="polite">
        <span className="rob-alt-spinner" aria-hidden="true" />
        Looking for the same model cheaper…
      </p>
    );
  }
  const [line1, line2] = alternativeCopy(alternative, req);
  return (
    <section className="rob-alt" aria-live="polite" aria-label="Cheaper option">
      <span className="rob-alt-tag">Cheaper elsewhere</span>
      <p className="rob-alt-main">{line1}</p>
      <p className="rob-alt-sub">{line2}</p>
    </section>
  );
}
