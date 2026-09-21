import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'RicozEdu',
  description: 'Education operating system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="top">
          <strong>RicozEdu</strong>
          <nav aria-label="Primary">
            <a href="/">Home</a>
            <a href="/login">Login</a>
            <a href="/admin/curriculum">Admin curriculum</a>
            <a href="/admin/rules">Admin rules</a>
            <a href="/student/progress">Student progress</a>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
