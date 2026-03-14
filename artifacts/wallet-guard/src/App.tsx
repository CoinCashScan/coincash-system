import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { Tab } from "@/components/BottomNav";
import DashboardPage from "@/pages/DashboardPage";
import WalletsPage from "@/pages/WalletsPage";
import ScannerPage from "@/pages/ScannerPage";
import ConnectionsPage from "@/pages/ConnectionsPage";
import SettingsPage from "@/pages/SettingsPage";
import BlacklistPage from "@/pages/BlacklistPage";
import PinLockScreen from "@/components/PinLockScreen";
import NotFound from "@/pages/not-found";
import { isPinEnabled } from "@/lib/security";

const queryClient = new QueryClient();

function MainApp() {
  const [tab, setTab]             = useState<Tab>("scanner");
  const [scanAddress, setScanAddress] = useState<string | undefined>();
  const [locked, setLocked]       = useState(() => isPinEnabled());

  useEffect(() => {
    // Re-check lock state whenever PIN setting changes (e.g. user enables PIN in Settings)
    const onStorage = () => {
      if (isPinEnabled() && !locked) { /* stay unlocked for current session */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [locked]);

  const handleScanWallet = (address: string) => {
    setScanAddress(address);
    setTab("scanner");
  };

  if (locked) return <PinLockScreen onUnlock={() => setLocked(false)} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div style={{ display: tab === "dashboard"   ? "block" : "none" }}>
        <DashboardPage onScanWallet={handleScanWallet} />
      </div>
      <div style={{ display: tab === "wallets"     ? "block" : "none" }}>
        <WalletsPage onScan={handleScanWallet} />
      </div>
      <div style={{ display: tab === "scanner"     ? "block" : "none" }}>
        <ScannerPage
          prefillAddress={tab === "scanner" ? scanAddress : undefined}
          onAddressConsumed={() => setScanAddress(undefined)}
        />
      </div>
      <div style={{ display: tab === "connections" ? "block" : "none" }}>
        <ConnectionsPage />
      </div>
      <div style={{ display: tab === "settings"   ? "block" : "none" }}>
        <SettingsPage />
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainApp} />
      <Route path="/blacklist" component={BlacklistPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
