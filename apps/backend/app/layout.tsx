export const metadata = { title: 'Resist or Be Broke API' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
