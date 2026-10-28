import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "radial-gradient(ellipse at 50% 30%, #09283f 0%, #030a13 72%)" }}>
      <div style={{ display: "flex", position: "absolute", left: "6%", top: "6%", width: "88%", height: "88%", borderRadius: "92px", border: "5px solid #00dfff", background: "linear-gradient(145deg, #0a3046 0%, #071426 34%, #020913 100%)", boxShadow: "0 0 18px #00caff" }} />
      <div style={{ display: "flex", position: "absolute", left: "17%", top: "21%", width: "66%", height: "62%", borderRadius: "38px", border: "6px solid #008bff", flexDirection: "column", background: "linear-gradient(180deg, #071d2e 0%, #020b17 100%)" }}>
        <div style={{ display: "flex", width: "100%", height: "25%", borderTopLeftRadius: "27px", borderTopRightRadius: "27px", background: "linear-gradient(100deg, #19e7f0, #006bff)" }} />
        <div style={{ display: "flex", flexDirection: "row", gap: "12px", marginTop: "36px", marginLeft: "23px" }}>
          {Array.from({length: 4}, (_, i) => <div key={i} style={{ display: "flex", width: "54px", height: "51px", borderRadius: "9px", background: i===3 ? "linear-gradient(135deg,#20fff5,#008cfc)" : "linear-gradient(135deg,#294b65,#0e2034)", border: "1px solid #37688b" }}>{i===3 ? <div style={{display:"flex",fontSize:38,color:"#031422",fontWeight:900,marginLeft:"15%"}}>✓</div> : null}</div>)}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: "30%", top: "15%", width: "7%", height: "16%", borderRadius: "18px", background: "linear-gradient(180deg,#34fff5,#007dff)", border: "1px solid #c1ffff" }} />
      <div style={{ display: "flex", position: "absolute", right: "30%", top: "15%", width: "7%", height: "16%", borderRadius: "18px", background: "linear-gradient(180deg,#34fff5,#007dff)", border: "1px solid #c1ffff" }} />
      <div style={{ display: "flex", position: "absolute", left: "13%", bottom: "10%", fontSize: 220, fontWeight: 900, letterSpacing: -20, color: "#f7fbff", textShadow: "0 5px 4px #10263d" }}>V</div>
      <div style={{ display: "flex", position: "absolute", right: "12%", bottom: "10%", fontSize: 220, fontWeight: 900, letterSpacing: -20, color: "#00dfff", textShadow: "0 5px 4px #064aa1" }}>S</div>
    </div>,
    { ...size }
  );
}
