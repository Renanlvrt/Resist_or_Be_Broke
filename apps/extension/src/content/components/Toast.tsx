import { useEffect } from 'react';

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className="rob-toast" role="status">
      {text}
    </div>
  );
}
