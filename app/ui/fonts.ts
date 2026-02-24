import localFont from 'next/font/local';

export const inter = localFont({
  src: [
    {
      path: '../../public/fonts/Inter-Variable.ttf',
      weight: '100 900',
      style: 'normal',
    },
  ],
  display: 'swap',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});

export const lusitana = localFont({
  src: [
    {
      path: '../../public/fonts/Lusitana-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Lusitana-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});
