import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#07101b", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ display: "flex", width: "78%", height: "76%", border: "8px solid #00dfff", borderRadius: "61px", flexDirection: "column", backgroundColor: "#102033", overflow: "hidden" }}>
        <div style={{ display: "flex", height: "20%", backgroundColor: "#00c9ef", justifyContent: "space-around", alignItems: "center" }}>
          <div style={{ display: "flex", width: "10%", height: "42%", borderRadius: 10, backgroundColor: "#ffffff" }} />
          <div style={{ display: "flex", width: "10%", height: "42%", borderRadius: 10, backgroundColor: "#ffffff" }} />
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", fontSize: 164, fontWeight: 900, color: "#ffffff", letterSpacing: -8 }}>
          V<span style={{ color: "#00dfff" }}>S</span>
        </div>
      </div>
    </div>,
    { ...size }
  );
}
