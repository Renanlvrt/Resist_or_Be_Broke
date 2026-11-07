import { useState } from 'react';

/** Hover the bottom-right corner: the avatar appears. Click (or Enter) opens the dashboard. */
export function Avatar({ onOpen }: { onOpen: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div
      className={`rob-corner ${shown ? 'rob-corner-on' : ''}`}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
    >
      <button
        className="rob-avatar"
        aria-label="Open my plan"
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
        onClick={onOpen}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="#2f6f5e" />
          <circle cx="23" cy="27" r="4" fill="#fff" />
          <circle cx="41" cy="27" r="4" fill="#fff" />
          <circle cx="23" cy="28" r="2" fill="#1b1b1b" />
          <circle cx="41" cy="28" r="2" fill="#1b1b1b" />
          <path d="M21 40 q11 9 22 0" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {shown && <span className="rob-avatar-tip">Your plan</span>}
    </div>
  );
}
