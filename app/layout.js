import "./globals.css";

export const metadata = {
  title: "Nexus — Claude Operations Platform",
  description: "Persistent chat with Claude, project context injection, and prompt enhancement",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
