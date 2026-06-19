import { ImageResponse } from "next/og";

// 빌드 시 정적 생성되는 PWA 앱 아이콘 (192x192) · apple-touch-icon 겸용 — 베이지 그라데이션 + ProofLoop
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f7efe1 0%, #ecdcc4 55%, #ddc7a4 100%)",
          color: "#102033",
          fontFamily: "sans-serif",
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        <div style={{ fontSize: 60, letterSpacing: -2 }}>Proof</div>
        <div style={{ fontSize: 60, letterSpacing: -2 }}>Loop</div>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
