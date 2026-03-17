import { ScanSearch, Settings } from "lucide-react";

export type Tab = "scanner" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  const isScanner = active === "scanner";
  const isSettings = active === "settings";

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
        alignItems: "center",
        height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Left spacer — mirrors the Settings button width to keep Scanner centered */}
      <div style={{ width: "80px", flexShrink: 0 }} />

      {/* Scanner — center */}
      <button
        onClick={() => onChange("scanner")}
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
          height: "100%",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            background: isScanner
              ? "linear-gradient(135deg,#00FFC6 0%,#00B8A9 100%)"
              : "rgba(0,255,198,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: isScanner ? "0 0 18px rgba(0,255,198,0.45)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          <ScanSearch
            style={{
              width: "20px",
              height: "20px",
              color: isScanner ? "#0B1220" : "#00FFC6",
            }}
          />
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: isScanner ? "#00FFC6" : "rgba(0,255,198,0.6)",
          }}
        >
          Scanner
        </span>
      </button>

      {/* Settings — right */}
      <button
        onClick={() => onChange("settings")}
        style={{
          width: "80px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          height: "100%",
        }}
      >
        <Settings
          style={{
            width: "20px",
            height: "20px",
            color: isSettings ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: isSettings ? 600 : 400,
            color: isSettings ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        >
          Settings
        </span>
      </button>
    </nav>
  );
}
