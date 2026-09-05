import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans"
});

export const metadata: Metadata = {
  title: {
    default: "Unicall Blue - Operaciones de Call Center",
    template: "%s | Unicall Blue"
  },
  description:
    "Unicall Blue centraliza ventas, rechazos, jornadas, operadores y reportes de call center.",
  applicationName: "Unicall Blue",
  keywords: ["call center", "operaciones", "ventas", "rechazos", "jornadas", "Unicall Blue"],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" }
    ],
    apple: "/apple-icon.png"
  },
  openGraph: {
    title: "Unicall Blue - Operaciones de Call Center",
    description:
      "Unicall Blue centraliza ventas, rechazos, jornadas, operadores y reportes de call center.",
    type: "website",
    siteName: "Unicall Blue",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Unicall Blue" }]
  },
  twitter: {
    card: "summary",
    title: "Unicall Blue - Operaciones de Call Center",
    description:
      "Unicall Blue centraliza ventas, rechazos, jornadas, operadores y reportes de call center.",
    images: ["/icon-512.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d4ed8"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d4ed8"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
