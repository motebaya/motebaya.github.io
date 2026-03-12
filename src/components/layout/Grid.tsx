import type { ReactNode } from "react";

interface GridProps {
  left: ReactNode;
  right: ReactNode;
}

export default function Grid({ left, right }: GridProps) {
  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-layout">
        <div className="flex flex-col gap-6">{left}</div>
        <div className="flex flex-col gap-6">{right}</div>
      </div>
    </main>
  );
}
