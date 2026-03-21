import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ScannerPage from "@/pages/ScannerPage";
import ChatPage from "@/pages/ChatPage";
import AdminPage from "@/pages/AdminPage";
import SettingsPage from "@/pages/SettingsPage";
import VideoPage from "@/pages/VideoPage";
import InstallVideoPage from "@/pages/InstallVideoPage";
import LegalPage from "@/pages/LegalPage";
import IOSInstallBanner from "@/components/IOSInstallBanner";
import SplashScreen from "@/components/SplashScreen";
import { API_BASE } from "@/lib/apiConfig";
import { FreemiumProvider } from "@/context/FreemiumContext";

const queryClient = new QueryClient();

function getHash() {
  return typeof window !== "undefined" ? window.location.hash : "";
}

function MainApp() {
  const [tab, setTab] = useState<Tab>("scanner");
  const [hash, setHash] = useState<string>(getHash);

  const isAdmin   = hash === "#soporte-admin";
  const isVideo   = hash === "#video";
  const isInstall = hash === "#instalar";
  const isLegal   = hash === "#legal";
  const isSpecial = isAdmin || isVideo || isInstall || isLegal;

  // Show splash only on the regular app (not on admin/hash routes)
  const [showSplash, setShowSplash] = useState(!isSpecial);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (isSpecial) return;
    fetch(`${API_BASE}/visit`, { method: "POST" }).catch(() => {});
  }, [isSpecial]);

  if (isAdmin)   return <AdminPage />;
  if (isVideo)   return <VideoPage />;
  if (isInstall) return <InstallVideoPage />;
  if (isLegal)   return <LegalPage />;

  // Splash is the ONLY thing rendered until it finishes — no scanner flicker
  if (showSplash) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
        <SplashScreen onDone={handleSplashDone} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
      <div style={{ display: tab === "scanner" ? "block" : "none" }}>
        <ScannerPage />
      </div>

      <div style={{ display: tab === "soporte" ? "block" : "none" }}>
        <ChatPage />
      </div>

      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <SettingsPage onOpenSupport={() => setTab("soporte")} />
      </div>

      <BottomNav active={tab} onChange={setTab} />
      <IOSInstallBanner />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <FreemiumProvider>
            <MainApp />
            <Toaster richColors position="top-center" />
          </FreemiumProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
