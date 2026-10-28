import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#06101c", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", position: "absolute", width: "89%", height: "89%", border: "2px solid #00dfff", borderRadius: "36px", background: "#071526", boxShadow: "0 0 30px #008de577" }} />
      <div style={{ display: "flex", position: "absolute", top: "20%", left: "18%", width: "64%", height: "62%", border: "3px solid #00bfff", borderRadius: "14px", background: "#081a2c", flexDirection: "column" }}>
        <div style={{ display: "flex", width: "100%", height: "22%", background: "#00cfff", borderTopLeftRadius: "9px", borderTopRightRadius: "9px" }} />
        <div style={{ display: "flex", flexDirection: "row", gap: "5px", padding: "11px 6px" }}>
          {Array.from({length: 4}, (_, i) => <div key={i} style={{ display: "flex", width: "19px", height: "18px", background: i===3 ? "#00e1ff" : "#19344c", borderRadius: "3px" }} />)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", top: "14%", left: "30%", width: "7%", height: "15%", background: "#00e1ff", borderRadius: "7px" }} />
      <div style={{ display: "flex", position: "absolute", top: "14%", right: "30%", width: "7%", height: "15%", background: "#00e1ff", borderRadius: "7px" }} />
      <div style={{ display: "flex", position: "absolute", bottom: "10%", left: "12%", fontSize: 76, fontWeight: 900, letterSpacing: -8, color: "#f4fbff", textShadow: "0 4px 8px #00101a" }}>V</div>
      <div style={{ display: "flex", position: "absolute", bottom: "10%", right: "12%", fontSize: 76, fontWeight: 900, letterSpacing: -8, color: "#00dfff", textShadow: "0 4px 8px #00101a" }}>S</div>
    </div>,
    { ...size }
  );
}
