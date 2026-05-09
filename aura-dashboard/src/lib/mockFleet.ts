export type RobotStatus =
  | "healthy"
  | "anomaly"
  | "idle"
  | "paused"
  | "offline";

export type Robot = {
  id: string;
  name: string;
  wallet_pubkey: string;
  status: RobotStatus;
  grade: "A" | "B" | "C" | "D" | "F";
  runway_hours: number;
  latest_event_ts: string;
  video_url: string;
  telemetry_ws_url: string;
  compliance_ws_url: string;
};

export type FleetStatus = { robots: Robot[] };

export const mockFleet: FleetStatus = {
  robots: [
    {
      id: "robot_01",
      name: "Aura-Panda-01",
      wallet_pubkey: "",
      status: "healthy",
      grade: "A",
      runway_hours: 42,
      latest_event_ts: new Date().toISOString(),
      video_url: "/videos/robot_01/third_person.mp4",
      telemetry_ws_url: "ws://localhost:8766",
      compliance_ws_url: "ws://localhost:8766",
    },
    {
      id: "robot_02",
      name: "Aura-Panda-02",
      wallet_pubkey: "",
      status: "anomaly",
      grade: "C",
      runway_hours: 18,
      latest_event_ts: new Date(Date.now() - 4 * 60_000).toISOString(),
      video_url: "/videos/robot_02/third_person.mp4",
      telemetry_ws_url: "ws://localhost:8771",
      compliance_ws_url: "ws://localhost:8771",
    },
    {
      id: "robot_03",
      name: "Aura-Panda-03",
      wallet_pubkey: "",
      status: "idle",
      grade: "B",
      runway_hours: 72,
      latest_event_ts: new Date(Date.now() - 30 * 60_000).toISOString(),
      video_url: "/videos/robot_03/third_person.mp4",
      telemetry_ws_url: "ws://localhost:8772",
      compliance_ws_url: "ws://localhost:8772",
    },
  ],
};
