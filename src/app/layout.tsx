import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sistem Keuangan Pesantren Hybrid Web3",
  description:
    "Sistem digitalisasi akademik dan keuangan Yayasan Pendidikan & Pondok Pesantren.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
