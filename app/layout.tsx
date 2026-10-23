import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "@/components/ThemeSync";
import { getProfile } from "@/app/settings/actions";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Motyw z profilu (serwerowo, bez migania); domyślnie jasny.
  const theme = (await getProfile())?.theme ?? "light";
  return (
    <html
      lang="pl"
      data-theme={theme}
      className={`${onest.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeSync theme={theme} />
        {children}
      </body>
    </html>
  );
}
