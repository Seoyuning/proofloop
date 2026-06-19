"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";

type Phase = "pre" | "title" | "tagline" | "end";

export default function Home() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pre");

  useEffect(() => {
    router.prefetch("/studio/login");

    const raf = requestAnimationFrame(() => setPhase("title"));
    const toTagline = setTimeout(() => setPhase("tagline"), 2100);
    const toEnd = setTimeout(() => setPhase("end"), 3600);
    const redirect = setTimeout(() => router.replace("/studio/login"), 4300);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toTagline);
      clearTimeout(toEnd);
      clearTimeout(redirect);
    };
  }, [router]);

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden px-6">
      <div className="relative flex w-full max-w-4xl items-center justify-center">
        <h1
          className="absolute text-center transition-opacity duration-[700ms] ease-out"
          style={{ opacity: phase === "title" ? 1 : 0 }}
        >
          <Logo className="text-5xl leading-[1.05] sm:text-7xl lg:text-[5.5rem]" />
        </h1>

        <p
          className="display-title absolute text-center text-3xl leading-[1.25] text-navy transition-opacity duration-[700ms] ease-out sm:text-4xl lg:text-5xl"
          style={{ opacity: phase === "tagline" ? 1 : 0 }}
        >
          학생의 질문이, 교사의 수업이 된다.
        </p>
      </div>
    </main>
  );
}
