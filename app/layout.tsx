import '@/app/ui/global.css';
import { inter } from '@/app/ui/fonts';
import { Metadata } from 'next';
import { ThemeProvider } from '@/app/ui/theme/theme-provider';
import ThemeInitScript from '@/app/ui/theme/theme-init-script';
 
export const metadata: Metadata = {
  title: {
    template: '%s | Lateless Dashboard',
    default: 'Lateless Dashboard',
  },
  description: 'Lateless Dashboard built with App Router.',
  metadataBase: new URL('https://next-learn-dashboard.vercel.sh'),
  
};
 
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.className} min-h-screen antialiased text-black dark:text-white`}
      >
        <ThemeInitScript />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
