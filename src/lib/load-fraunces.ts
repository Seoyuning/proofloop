// 시작화면과 동일한 Fraunces 세리프 폰트를 ImageResponse(PWA 아이콘 생성)에 넣기 위한 로더.
// 빌드 시 1회 Google Fonts에서 TTF를 받아온다(IE UA → woff2 대신 ttf 반환). 실패 시 null → 기본 세리프 폴백.
export async function loadFraunces(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Fraunces:wght@600&text=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)" } },
    ).then((r) => r.text());
    // Satori는 ttf/otf/woff 지원 (woff2 미지원). IE UA로 받으면 보통 woff을 준다.
    const match = css.match(/src:\s*url\((.+?)\)\s*format\(['"]?(?:woff|truetype|opentype)['"]?\)/);
    if (!match) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
