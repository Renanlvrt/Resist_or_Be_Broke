import type { ISODate, LogEntry, Profile } from '@resist/engine';

interface Props {
  profile: Profile;
  log: LogEntry[];
  today: ISODate;
}

/** Goal progress line: saved vs target by date. TODO(thread 3). */
export function GoalTrend(_props: Props) {
  return null;
}
