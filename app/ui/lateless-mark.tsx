import clsx from 'clsx';

type LatelessMarkProps = {
  size?: 36 | 44;
  className?: string;
};

export function LatelessMark({ size = 44, className }: LatelessMarkProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className={size === 44 ? 'h-5 w-5' : 'h-4.5 w-4.5'}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 5.5V18.5H16.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

