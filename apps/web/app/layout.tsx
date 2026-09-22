import type { ReactNode } from 'react';
import { Source_Serif_4, Source_Sans_3 } from 'next/font/google';
import { AppShell } from '../components/AppShell';
import './globals.css';

const display = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-literata',
  display: 'swap',
});

const body = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata = {
  title: 'RicozEdu',
  description: 'Education operating system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AppShell>
          <main id="main">{children}</main>
        </AppShell>
      </body>
    </html>
  );
}
