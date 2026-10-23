import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Eko Taxi",
  description: "Eko Taxi — zamów przejazd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Motyw na sztywno; późniejsze zadanie czyta go z profilu użytkownika.
    <html
      lang="pl"
      data-theme="light"
      className={`${onest.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
