import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#06101c", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", position: "absolute", width: "89%", height: "89%", border: "6px solid #00dfff", borderRadius: "102px", background: "#071526", boxShadow: "0 0 30px #008de577" }} />
      <div style={{ display: "flex", position: "absolute", top: "20%", left: "18%", width: "64%", height: "62%", border: "9px solid #00bfff", borderRadius: "38px", background: "#081a2c", flexDirection: "column" }}>
        <div style={{ display: "flex", width: "100%", height: "22%", background: "#00cfff", borderTopLeftRadius: "26px", borderTopRightRadius: "26px" }} />
        <div style={{ display: "flex", flexDirection: "row", gap: "13px", padding: "31px 18px" }}>
          {Array.from({length: 4}, (_, i) => <div key={i} style={{ display: "flex", width: "54px", height: "51px", background: i===3 ? "#00e1ff" : "#19344c", borderRadius: "9px" }} />)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", top: "14%", left: "30%", width: "7%", height: "15%", background: "#00e1ff", borderRadius: "20px" }} />
      <div style={{ display: "flex", position: "absolute", top: "14%", right: "30%", width: "7%", height: "15%", background: "#00e1ff", borderRadius: "20px" }} />
      <div style={{ display: "flex", position: "absolute", bottom: "10%", left: "12%", fontSize: 215, fontWeight: 900, letterSpacing: -23, color: "#f4fbff", textShadow: "0 4px 8px #00101a" }}>V</div>
      <div style={{ display: "flex", position: "absolute", bottom: "10%", right: "12%", fontSize: 215, fontWeight: 900, letterSpacing: -23, color: "#00dfff", textShadow: "0 4px 8px #00101a" }}>S</div>
    </div>,
    { ...size }
  );
}
