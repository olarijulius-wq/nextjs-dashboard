import '@/app/ui/global.css';
import { inter } from '@/app/ui/fonts';
import { Metadata } from 'next';
import { ThemeProvider } from '@/app/ui/theme/theme-provider';
import ThemeInitScript from '@/app/ui/theme/theme-init-script';
import { getSiteUrl } from '@/app/lib/seo/site-url';
 
export const metadata: Metadata = {
  title: {
    template: '%s | Lateless',
    default: 'Lateless',
  },
  description:
    'Invoicing with payment links, reminders, and Stripe payouts for freelancers and small teams.',
  applicationName: 'Lateless',
  metadataBase: getSiteUrl(),
  openGraph: {
    type: 'website',
    siteName: 'Lateless',
    title: 'Lateless',
    description:
      'Invoicing with payment links, reminders, and Stripe payouts for freelancers and small teams.',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lateless',
    description:
      'Invoicing with payment links, reminders, and Stripe payouts for freelancers and small teams.',
    images: ['/opengraph-image.png'],
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
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
