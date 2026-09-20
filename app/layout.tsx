import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import { GlobalSidebar } from "@/src/components/layout/GlobalSidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="h-full antialiased">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
      </head>
      <body className="relative isolate flex min-h-dvh flex-col md:flex-row">
        <div aria-hidden="true" className="app-canvas" />
        <a href="#main-content" className="skip-link">Skip to content</a>
        <AuthProvider>
          <GlobalSidebar />
          <main id="main-content" tabIndex={-1} className="app-main">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
