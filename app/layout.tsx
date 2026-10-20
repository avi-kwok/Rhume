import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import Header from "@/components/Header";
import Overlays from "@/components/Overlays";
import StoreHydrator from "@/components/StoreHydrator";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rhume",
  description:
    "Rhume: replay of the 2023–24 Canadian flu season. Sense, decide and act on regional respiratory surges (prototype, simulated SAP actions).",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} h-full antialiased`}>
      <body className="flex h-full flex-col overflow-hidden bg-bg font-sans text-ink">
        <StoreHydrator />
        <Header />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        <Overlays />
      </body>
    </html>
  );
}
