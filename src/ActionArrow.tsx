export function ActionArrow({ direction }: { direction?: "up" | "down" }) {
  return (
    <span
      className="arrow-button"
      data-direction={direction}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path
          className="arrow-curve"
          pathLength="1"
          d="M14 19H9.5a5.5 5.5 0 0 1 0-11H20"
        />
        <path className="arrow-tip" d="m15 3 5 5-5 5" />
      </svg>
    </span>
  );
}
