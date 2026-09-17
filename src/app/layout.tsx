import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Speed Guesser Tracker',
  description: 'Daily TimeGuesser and Speed Quiz leaderboard',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
