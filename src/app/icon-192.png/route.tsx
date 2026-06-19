import { ImageResponse } from "next/og";
import { loadFraunces } from "@/lib/load-fraunces";

// 빌드 시 정적 생성되는 PWA 앱 아이콘 (192x192) · apple-touch-icon 겸용
// 베이지 그라데이션 + 시작화면 폰트(Fraunces)로 ProofLoop 한 줄
export const dynamic = "force-static";

export async function GET() {
  const font = await loadFraunces("ProofLoop");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f7efe1 0%, #ecdcc4 55%, #ddc7a4 100%)",
          fontFamily: font ? "Fraunces" : "serif",
          fontWeight: 600,
          fontSize: 27,
          letterSpacing: -1,
        }}
      >
        <span style={{ color: "#102033" }}>Proof</span>
        <span style={{ color: "#0b8f80" }}>Loop</span>
      </div>
    ),
    {
      width: 192,
      height: 192,
      fonts: font ? [{ name: "Fraunces", data: font, weight: 600, style: "normal" }] : undefined,
    },
  );
}
