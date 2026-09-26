/** Verdict mark: a ruled line that resolves into a decision tick. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--ink)" />
      <path d="M5.5 8.5h6" stroke="var(--canvas)" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M5.5 12h4" stroke="var(--canvas)" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M9.5 15.2l2.6 2.6 6.4-8.3" stroke="var(--canvas)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
