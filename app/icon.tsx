import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#050b16", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", width: "88%", height: "88%", borderRadius: "87px", backgroundColor: "#0a1829", border: "5px solid #00bfff", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: "78%", height: "74%", borderRadius: "49px", backgroundColor: "#102238", border: "6px solid #16d9ff", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", width: "100%", height: "24%", backgroundColor: "#00cfff", alignItems: "center", justifyContent: "space-around" }}>
            <div style={{ display: "flex", width: "10%", height: "45%", borderRadius: 12, backgroundColor: "#f5ffff" }} />
            <div style={{ display: "flex", width: "10%", height: "45%", borderRadius: 12, backgroundColor: "#f5ffff" }} />
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 184, fontWeight: 900, letterSpacing: -9 }}>
            <span style={{ color: "#ffffff" }}>V</span><span style={{ color: "#00dfff" }}>S</span>
          </div>
        </div>
      </div>
    </div>,
    { ...size }
  );
}
