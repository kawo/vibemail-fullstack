import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { themeScript } from '@/app/lib/themeScript';
import '@/app/styles/tokens.css';
import '@/app/styles/glass.css';
import '@/app/styles/app.css';

export const metadata: Metadata = {
  title: 'VibeMail Glass',
  description: 'Your Gmail, liberated into a mailbox you own.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#070d24',
};

/**
 * The document: JetBrains Mono, the VibeMail Glass styles (tokens → glass → app, the original
 * cascade order), and the inline script that applies the stored theme and text size before the
 * first paint. It sets attributes on <html> the server didn't render, hence suppressHydrationWarning.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
