import { AISHA, DEMO_TODAY, todayISO, type ISODate, type LogEntry, type Profile } from '@resist/engine';
import { SEED_LOG } from './seed';

/** Everything lives in chrome.storage.local. Nothing here is ever sent to the backend. */
export interface Settings {
  /** Pin "today" so demo numbers are identical on stage. null = real date. */
  demoToday: ISODate | null;
  voice: boolean;
}

export interface Reminder {
  item: string;
  price: number;
  url: string;
  due: string;
}

export interface State {
  profile: Profile;
  log: LogEntry[];
  settings: Settings;
  reminders: Reminder[];
}

const KEY = 'rob:state:v1';

export function defaultState(): State {
  return {
    profile: structuredClone(AISHA),
    log: structuredClone(SEED_LOG),
    settings: { demoToday: DEMO_TODAY, voice: true },
    reminders: [],
  };
}

const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;
let memory: State | null = null; // fallback outside the extension (tests, plain pages)

export async function loadState(): Promise<State> {
  if (!hasChrome) return (memory ??= defaultState());
  const got = await chrome.storage.local.get(KEY);
  const s = got[KEY] as State | undefined;
  if (s) return { ...defaultState(), ...s };
  const fresh = defaultState();
  await chrome.storage.local.set({ [KEY]: fresh });
  return fresh;
}

export async function saveState(patch: Partial<State>): Promise<State> {
  const next = { ...(await loadState()), ...patch };
  if (hasChrome) await chrome.storage.local.set({ [KEY]: next });
  else memory = next;
  return next;
}

export async function appendLog(entry: LogEntry): Promise<State> {
  const s = await loadState();
  return saveState({ log: [...s.log, entry] });
}

export async function resetDemo(): Promise<State> {
  const fresh = defaultState();
  if (hasChrome) await chrome.storage.local.set({ [KEY]: fresh });
  else memory = fresh;
  return fresh;
}

export function onStateChange(cb: (s: State) => void): () => void {
  if (!hasChrome) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]?.newValue) cb({ ...defaultState(), ...(changes[KEY].newValue as State) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function getToday(settings: Settings): ISODate {
  return settings.demoToday ?? todayISO();
}
