"use client";

export function VideoFeed({
  src,
  title,
  aspect = "16/9",
}: {
  src: string;
  title: string;
  aspect?: "16/9" | "4/3";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {title}
        </span>
      </div>
      <div
        className={`relative ${aspect === "16/9" ? "aspect-video" : "aspect-[4/3]"} bg-black`}
      >
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted bg-black/40 pointer-events-none">
          {/* placeholder overlay until videos exist */}
          no video — drop {src} into public/
        </div>
      </div>
    </div>
  );
}
