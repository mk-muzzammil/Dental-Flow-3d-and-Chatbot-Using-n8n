import styles from './LoadingIndicator.module.css';

/** A shared, labelled status for route loads, data refreshes and submit buttons. */
export function LoadingIndicator({ label = 'Loading…', inline = false, page = false, compact = false }: {
  label?: string;
  inline?: boolean;
  page?: boolean;
  compact?: boolean;
}) {
  return (
    <span role="status" aria-live="polite" aria-atomic="true"
      className={`${styles.loading} ${inline ? styles.inline : page ? styles.page : compact ? styles.compact : styles.component}`}>
      <svg className={styles.spinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}
