/** Logo: una huella de mascota. */
export function Marca({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="20" fill="var(--acento)" />
      <g fill="#fff">
        <ellipse cx="13" cy="17" rx="2.6" ry="3.4" transform="rotate(-18 13 17)" />
        <ellipse cx="18.5" cy="12.5" rx="2.6" ry="3.5" />
        <ellipse cx="25.5" cy="12.5" rx="2.6" ry="3.5" />
        <ellipse cx="31" cy="17" rx="2.6" ry="3.4" transform="rotate(18 31 17)" />
        <path d="M22 18.5c4.2 0 8 4 8 8 0 3-2.6 4.5-5 4-1.2-.3-1.9-.7-3-.7s-1.8.4-3 .7c-2.4.5-5-1-5-4 0-4 3.8-8 8-8z" />
      </g>
    </svg>
  );
}
