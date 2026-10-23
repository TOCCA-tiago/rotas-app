import localFont from "next/font/local";
import "./globals.css";

const clash = localFont({
  src: [
    { path: "./fonts/ClashDisplay-Light.otf", weight: "300" },
    { path: "./fonts/ClashDisplay-Regular.otf", weight: "400" },
    { path: "./fonts/ClashDisplay-Medium.otf", weight: "500" },
    { path: "./fonts/ClashDisplay-Semibold.otf", weight: "600" },
    { path: "./fonts/ClashDisplay-Bold.otf", weight: "700" },
  ],
  variable: "--font-clash",
  display: "swap",
});

const schabo = localFont({
  src: "./fonts/SCHABO-Condensed.woff2",
  variable: "--font-schabo",
  display: "swap",
});

export const metadata = {
  title: "TOCCA Rotas",
  description: "Rotas de entrega a partir das notas fiscais do Tiny",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${clash.variable} ${schabo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
