import { ImageResponse } from "next/og";
import { PROFILE } from "@/lib/content";

export const alt = `${PROFILE.name} — Flight Ops Portfolio: autonomy, perception, and full-stack systems`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex", width: "100%", height: "100%",
          background: "#04070a", color: "#e4f3f7", padding: 48,
          fontFamily: "sans-serif",
          backgroundImage: "linear-gradient(#0d1c23 1px, transparent 1px), linear-gradient(90deg, #0d1c23 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: "100%", border: "1px solid #2b4a54", padding: 40, background: "#080f13" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, letterSpacing: 4 }}>
            <span style={{ color: "#ffb44a" }}>MISSION CONTROL</span>
            <span style={{ color: "#8ef2a0" }}>FLIGHT OPS / PORTFOLIO</span>
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
              <div style={{ color: "#56dcff", fontSize: 18, letterSpacing: 4, marginBottom: 18 }}>ENGINEERING AUTONOMY</div>
              <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1 }}>{PROFILE.name}</div>
              <div style={{ fontSize: 29, color: "#a9c2c8", marginTop: 24, lineHeight: 1.4, maxWidth: 620 }}>{PROFILE.title}</div>
            </div>
            <svg width="240" height="240" viewBox="0 0 240 240" fill="none">
              <circle cx="120" cy="120" r="108" stroke="#2b4a54" strokeWidth="2" />
              <circle cx="120" cy="120" r="76" stroke="#2b4a54" strokeWidth="2" />
              <circle cx="120" cy="120" r="36" stroke="#56dcff" strokeWidth="2" />
              <path d="M120 0V88M120 152V240M0 120H88M152 120H240" stroke="#56dcff" strokeWidth="2" />
              <path d="M48 174L87 147L115 161L150 94L188 66" stroke="#ffb44a" strokeWidth="3" />
              <circle cx="188" cy="66" r="6" fill="#ffb44a" />
              <circle cx="120" cy="120" r="5" fill="#8ef2a0" />
            </svg>
          </div>
          <div style={{ display: "flex", borderTop: "1px solid #2b4a54", paddingTop: 24, justifyContent: "space-between", fontSize: 16, letterSpacing: 2 }}>
            <span style={{ color: "#ffb44a" }}>AUTONOMY / PERCEPTION / FULL-STACK</span>
            <span style={{ color: "#a9c2c8" }}>{PROFILE.location.toUpperCase()}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
