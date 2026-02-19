'use client';
 
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import clsx from 'clsx';
import { listControlsInputClasses } from '@/app/ui/list-controls/styles';
 
type SearchProps = {
  placeholder: string;
  className?: string;
  queryParam?: string;
  pageParam?: string;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

export default function Search({
  placeholder,
  className,
  queryParam = 'query',
  pageParam = 'page',
  onFocus,
  onBlur,
}: SearchProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    const normalized = term.trim();
    params.set(pageParam, '1');
    if (normalized) {
      params.set(queryParam, normalized);
    } else {
      params.delete(queryParam);
    }
    replace(`${pathname}?${params.toString()}`);
  }, 300);
 
  return (
    <div className={clsx('relative flex flex-1 shrink-0', className)}>
      <label htmlFor="search" className="sr-only">
        Search
      </label>
      <input
        className={clsx(listControlsInputClasses, 'peer block py-[9px] pl-10')}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => {
          handleSearch(e.target.value);
        }}
        defaultValue={searchParams.get(queryParam)?.toString()}
      />
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500 transition peer-focus:text-neutral-700 dark:peer-focus:text-neutral-300" />
    </div>
  );
}
