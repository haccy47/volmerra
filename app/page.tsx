
"use client";

import { useState } from "react";
import { Cinzel } from "next/font/google";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["700"] });

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        textAlign: "center",
        color: "white",
        position: "relative",
        overflow: "hidden",
        backgroundImage:
          "linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url('/images/volmerra.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(8px)",
          background: "rgba(0,0,0,.15)",
          pointerEvents: "none",
        }}
      />

      <button
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 1001,
          fontSize: 34,
          background: "#3b2412",
          color: "#f3d27b",
          border: "2px solid #b98a2e",
          borderRadius: 12,
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        📜
      </button>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: menuOpen ? 0 : "-320px",
          width: 320,
          height: "100vh",
          background: "#1a120c",
          borderRight: "3px solid #b98a2e",
          transition: "left .3s ease",
          zIndex: 1000,
          padding: "90px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        <h2 className={cinzel.className} style={{ color: "#d6a62a" }}>
          Volmerra
        </h2>
        {["📖 Hikaye","🗺️ Harita","👥 Karakterler","💎 Taşlar","🌍 Bölgeler"].map(i=>(
          <div key={i} style={{padding:"14px 0",fontSize:20,borderBottom:"1px solid #4b3929"}}>
            {i}
          </div>
        ))}
      </div>

      <div style={{position:"relative",zIndex:2,maxWidth:900}}>
        <h1
          className={cinzel.className}
          style={{
            fontSize: "clamp(52px,10vw,110px)",
            color: "#d69e25",
            letterSpacing: 8,
            textShadow: "0 4px 12px black",
          }}
        >
          Volmerra I
        </h1>

        <p style={{fontSize:"clamp(16px,2vw,22px)"}}>
          Fanilerin, Büyülülerin ve Efsanelerin Dünyası
        </p>

        <button
          style={{
            marginTop:30,
            padding:"14px 28px",
            fontSize:20,
            borderRadius:14,
            border:"2px solid #8a5a00",
            background:"linear-gradient(45deg,#8a5a00,#d69e25)",
            fontWeight:"bold",
            cursor:"pointer",
          }}
        >
          Volmerra'ya Katıl!
        </button>
      </div>
    </main>
  );
}

