import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist, Mona_Sans } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Keylock - Centralized RFID Door Lock System",
  description:
    "A centralized door lock system designed to enhance security and access management using RFID technology",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const monaSans = Mona_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mona-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${monaSans.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
