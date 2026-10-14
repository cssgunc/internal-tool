import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSSG Internal Tool",
  description: "Recruiting, roster, and project management for CS + Social Good at UNC.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
