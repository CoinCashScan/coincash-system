import { LayoutDashboard, Wallet, ArrowDownUp, ScanSearch, Settings } from "lucide-react";

export type Tab = "dashboard" | "wallets" | "swap" | "scanner" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const GREEN  = "#19C37D";
const PURPLE = "#7C3AED";
const CARD   = "#0e1520";
const BORDER = "rgba(255,255,255,0.07)";

const TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }>; accent?: string }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "wallets",   label: "Wallets",   Icon: Wallet },
  { id: "swap",      label: "Swap",      Icon: ArrowDownUp, accent: PURPLE },
  { id: "scanner",   label: "Scanner",   Icon: ScanSearch },
  { id: "settings",  label: "Settings",  Icon: Settings },
];

const BottomNav = ({ active, onChange }: BottomNavProps) => (
  <nav
    className="fixed bottom-0 inset-x-0 z-[100] flex items-center justify-around"
    style={{
      background: CARD,
      borderTop: `1px solid ${BORDER}`,
      backdropFilter: "blur(20px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
    {TABS.map(({ id, label, Icon, accent }) => {
      const isActive = active === id;
      const color    = isActive ? (accent ?? GREEN) : "rgba(255,255,255,0.35)";
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="relative flex flex-1 flex-col items-center gap-1 py-3 transition-all duration-150"
          style={{ color }}>
          {/* Active indicator bar */}
          {isActive && (
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
              style={{ width: 28, height: 2, background: accent ?? GREEN, boxShadow: `0 0 8px ${accent ?? GREEN}` }}
            />
          )}
          {/* Swap tab gets a special pill background when active */}
          {id === "swap" && isActive ? (
            <div className="flex items-center justify-center h-7 w-7 rounded-xl"
              style={{ background: `${PURPLE}25` }}>
              <Icon className="h-4 w-4" />
            </div>
          ) : (
            <Icon className="h-5 w-5" />
          )}
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
        </button>
      );
    })}
  </nav>
);

export default BottomNav;
