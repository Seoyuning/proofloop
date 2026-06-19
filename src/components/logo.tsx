/**
 * ProofLoop 워드마크 로고.
 * 글자는 "ProofLoop" 그대로, "Proof"=네이비 / "Loop"=민트 투톤.
 * 크기는 부모에서 font-size(text-* 클래스)로 지정 — 어디서나 재사용.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`display-title font-semibold tracking-[-0.03em] ${className}`}>
      <span className="text-navy">Proof</span>
      <span className="text-teal">Loop</span>
    </span>
  );
}
