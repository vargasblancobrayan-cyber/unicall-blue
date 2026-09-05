import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans"
});

export const metadata: Metadata = {
  title: "Unicall Blue - Operaciones de Call Center",
  description:
    "Unicall Blue centraliza ventas, rechazos, jornadas, operadores y reportes de call center."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
