import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import { GlobalSidebar } from "@/src/components/layout/GlobalSidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional" />
      </head>
      <body className="flex h-screen w-screen overflow-hidden bg-brutalBg font-['Plus_Jakarta_Sans']">
        <AuthProvider>
          <GlobalSidebar />
          <main className="flex-1 overflow-y-auto relative">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
