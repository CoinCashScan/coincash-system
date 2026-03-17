interface PlaceholderPageProps {
  title: string;
  icon: string;
}

export default function PlaceholderPage({ title, icon }: PlaceholderPageProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0F14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        paddingBottom: "80px",
      }}
    >
      <div
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "20px",
          background: "rgba(0,255,198,0.08)",
          border: "1px solid rgba(0,255,198,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "32px",
        }}
      >
        {icon}
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: "18px", margin: 0 }}>{title}</p>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", marginTop: "6px" }}>
          Próximamente
        </p>
      </div>
    </div>
  );
}
