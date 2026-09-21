import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DIBUJEITOR PRO — Escuela Para Animadores de Rosario",
  description:
    "Software de animación tradicional 2D para escuela: dibujo cuadro a cuadro, línea de tiempo, onion skin, capas, audio y funciones interactivas inspiradas en Flash clásico.",
  keywords: [
    "animación 2D",
    "animación tradicional",
    "frame by frame",
    "onion skin",
    "escuela de animación",
    "timeline",
    "dibujo digital",
    "DIBUJEITOR PRO",
    "Rosario",
  ],
  authors: [{ name: "Escuela Para Animadores de Rosario" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
