import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#0a0d12", color: "#00e1ff", alignItems: "center", justifyContent: "center", borderRadius: 100, fontSize: 170, fontWeight: 800, letterSpacing: -14 }}>
      VS
    </div>,
    { ...size }
  );
}
