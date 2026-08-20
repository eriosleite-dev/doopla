export function EyeLogo({ onDark = false, className = '' }: { onDark?: boolean; className?: string }) {
  return (
    <span className={`eye-logo${onDark ? ' on-dark' : ''} ${className}`}>
      d
      <span className="dot" aria-hidden="true">
        <span className="pupil" />
      </span>
      <span className="dot" aria-hidden="true">
        <span className="pupil" />
      </span>
      pla
    </span>
  );
}
