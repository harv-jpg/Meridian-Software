import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian",
  description: "The AI-powered CRM for freelancers and consultants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
