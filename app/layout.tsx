import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edgelog",
  description: "Thesis-driven short-term trading journal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="grain min-h-screen">{children}</body>
    </html>
  );
}
