interface Props {
  /** Called with question → answer whenever an answer changes. Skippable: never required. */
  onChange: (answers: Record<string, string>) => void;
}

/** 1–2 skippable reflection questions, amber only. TODO(thread 2). */
export function Reflection(_props: Props) {
  return null;
}
