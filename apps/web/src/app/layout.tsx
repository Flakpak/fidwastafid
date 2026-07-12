import type { Metadata } from "next";
import { Scheherazade_New } from "next/font/google";
import "./globals.css";

const scheherazade = Scheherazade_New({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-scheherazade",
});

export const metadata: Metadata = {
  title: "Fidwastafid",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={scheherazade.variable}>
      <body>{children}</body>
    </html>
  );
}
