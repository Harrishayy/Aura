import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopStrip } from "@/components/TopStrip";
import { Sidebar } from "@/components/Sidebar";
import { AuraConversation } from "@/components/AuraConversation";
import { SocketManager } from "@/lib/socket";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aura — fleet operations",
  description: "Voice-native operations agent for an autonomous robot fleet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <SocketManager />
        <div className="flex h-full">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopStrip />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <AuraConversation />
        </div>
      </body>
    </html>
  );
}
