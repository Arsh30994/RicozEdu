import type { ReactNode } from 'react';
import { Poppins, Source_Sans_3 } from 'next/font/google';
import { AppShell } from '../components/AppShell';
import './globals.css';

const display = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const body = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata = {
  title: 'RicozEdu Console',
  description: 'Institution administration console for RicozEdu.',
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
