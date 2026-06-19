import { ImageResponse } from "next/og";

// 빌드 시 정적 생성되는 PWA 앱 아이콘 (192x192) · apple-touch-icon 겸용
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#102033",
          color: "#ffffff",
          fontSize: 112,
          fontWeight: 800,
          letterSpacing: -5,
          fontFamily: "sans-serif",
        }}
      >
        <span>P</span>
        <span style={{ color: "#2dd4bf" }}>L</span>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
