import type { FleetStatus } from "./types";

export const mockFleet: FleetStatus = {
  robots: [
    {
      id: "robot_01",
      name: "Aura-Panda-01",
      wallet_pubkey: "7xKn4d3vR9JZ2fL8mNpQ5sT1cBwUyXkH6gAeP4VrM2dY",
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
      wallet_pubkey: "9pQrK7TwYzN3bH5xVjR2cMfL8sD4uG1eAi6Pd2nXB3kt",
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
      wallet_pubkey: "3mLb8XcN5RzP7vYjK1tH2sQ6uW4eD9fA2gBpV5xRn8wC",
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

export type { Robot, RobotStatus, FleetStatus } from "./types";
