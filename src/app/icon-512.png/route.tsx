import { ImageResponse } from "next/og";

// 빌드 시 정적 생성되는 PWA 앱 아이콘 (512x512)
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
          fontSize: 300,
          fontWeight: 800,
          letterSpacing: -12,
          fontFamily: "sans-serif",
        }}
      >
        <span>P</span>
        <span style={{ color: "#2dd4bf" }}>L</span>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
