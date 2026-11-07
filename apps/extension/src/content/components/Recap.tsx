import type { ISODate } from '@resist/engine';
import type { State } from '../../lib/storage';

interface Props {
  state: State;
  today: ISODate;
}

/** Monthly recap: kept, redirected, overruled, each rule in the user's words. TODO(thread 3). */
export function Recap(_props: Props) {
  return <p className="rob-muted">Recap coming soon.</p>;
}
