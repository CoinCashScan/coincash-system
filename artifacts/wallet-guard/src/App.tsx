import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ScannerPage from "@/pages/ScannerPage";
import PlaceholderPage from "@/pages/PlaceholderPage";

const queryClient = new QueryClient();

function MainApp() {
  const [tab, setTab] = useState<Tab>("scanner");

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
      <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
        <PlaceholderPage title="Dashboard" icon="📊" />
      </div>
      <div style={{ display: tab === "wallets" ? "block" : "none" }}>
        <PlaceholderPage title="Wallets" icon="👛" />
      </div>
      <div style={{ display: tab === "scanner" ? "block" : "none" }}>
        <ScannerPage />
      </div>
      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <PlaceholderPage title="Settings" icon="⚙️" />
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <MainApp />
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
