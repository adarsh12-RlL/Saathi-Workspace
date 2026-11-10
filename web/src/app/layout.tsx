import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAATHI — Personal Mission Workspace",
  description: "Carry your missions, decisions and next steps across devices.",
  applicationName: "SAATHI",
  appleWebApp: { capable: true, title: "SAATHI", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
