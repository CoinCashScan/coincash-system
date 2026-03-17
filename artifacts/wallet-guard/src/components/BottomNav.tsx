import { LayoutDashboard, Wallet, ScanSearch, Settings } from "lucide-react";

export type Tab = "dashboard" | "wallets" | "scanner" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "wallets",   label: "Wallets",   Icon: Wallet },
  { id: "scanner",   label: "Scanner",   Icon: ScanSearch },
  { id: "settings",  label: "Settings",  Icon: Settings },
];

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: "#0B1220",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "stretch",
        height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const isScanner = id === "scanner";

        if (isScanner) {
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  background: isActive
                    ? "linear-gradient(135deg,#00FFC6 0%,#00B8A9 100%)"
                    : "rgba(0,255,198,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isActive
                    ? "0 0 18px rgba(0,255,198,0.5)"
                    : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <Icon
                  style={{
                    width: "20px",
                    height: "20px",
                    color: isActive ? "#0B1220" : "#00FFC6",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: isActive ? "#00FFC6" : "rgba(0,255,198,0.6)",
                }}
              >
                {label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "opacity 0.15s",
            }}
          >
            <Icon
              style={{
                width: "20px",
                height: "20px",
                color: isActive ? "#00FFC6" : "rgba(255,255,255,0.35)",
                transition: "color 0.2s",
              }}
            />
            <span
              style={{
                fontSize: "10px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#00FFC6" : "rgba(255,255,255,0.35)",
                transition: "color 0.2s",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
