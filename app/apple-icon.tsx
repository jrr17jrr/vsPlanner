import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#0a0d12", color: "#00e1ff", alignItems: "center", justifyContent: "center", borderRadius: 36, fontSize: 66, fontWeight: 800, letterSpacing: -5 }}>
      VS
    </div>,
    { ...size }
  );
}
