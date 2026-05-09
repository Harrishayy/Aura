import Link from "next/link";
import { notFound } from "next/navigation";
import { mockFleet } from "@/lib/mockFleet";
import { IdentityTile } from "@/components/IdentityTile";
import { VideoFeed } from "@/components/VideoFeed";
import { LiveTelemetry } from "@/components/LiveTelemetry";
import { ComplianceLog } from "@/components/ComplianceLog";
import { PaymentTicker } from "@/components/PaymentTicker";

export default async function RobotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const robot = mockFleet.robots.find((r) => r.id === id);
  if (!robot) notFound();

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs text-muted hover:text-foreground font-mono uppercase tracking-widest"
          >
            ← factory floor
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{robot.name}</h1>
          <div className="text-xs text-muted font-mono">{robot.id}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <VideoFeed
            src={`/videos/${robot.id}/third_person.mp4`}
            title="Third-person camera"
            aspect="16/9"
          />
          <VideoFeed
            src={`/videos/${robot.id}/wrist.mp4`}
            title="Wrist camera"
            aspect="4/3"
          />
        </div>

        <div className="space-y-4">
          <LiveTelemetry robotId={robot.id} />
          <ComplianceLog robotId={robot.id} />
          <PaymentTicker robotId={robot.id} />
          <IdentityTile robotId={robot.id} />
        </div>
      </div>
    </div>
  );
}
