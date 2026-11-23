"use client";

import Image from "next/image";
import { useState } from "react";
import { Landmark } from "lucide-react";

export function PesantrenLogo({
  className = "h-11 w-11",
  iconSize = 22,
}: {
  className?: string;
  iconSize?: number;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span
        className={`flex items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm ${className}`}
      >
        <Landmark aria-hidden="true" size={iconSize} />
      </span>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-slate-200 shadow-sm ${className}`}
    >
      <Image
        src="/images/logo-pesantren.png"
        alt="Logo Pondok Pesantren Nurul Huda Pangauban"
        width={128}
        height={128}
        className="h-full w-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  );
}
