export type RobotId = "robot_01" | "robot_02" | "robot_03";

export type RobotStatus = "healthy" | "anomaly" | "idle" | "paused" | "offline";

export type RobotGrade = "A" | "B" | "C" | "D" | "F";

export type Robot = {
  id: RobotId | string;
  name: string;
  wallet_pubkey: string;
  status: RobotStatus;
  grade: RobotGrade;
  runway_hours: number;
  latest_event_ts: string;
  video_url: string;
  telemetry_ws_url: string;
  compliance_ws_url: string;
};

export type FleetStatus = { robots: Robot[] };

export type JointFrame = {
  t: number;
  joints: number[];
  torques: number[];
  gripper: { open: boolean; force: number };
};

export type ComplianceEvent = {
  hash: string;
  severity: number;
  reason_code: string;
  timestamp: string;
  tx_signature: string;
  explorer_url: string;
};

export type PaymentEvent = {
  robot_id: string;
  amount_lamports: number;
  provider_pubkey: string;
  tx_signature: string;
  explorer_url: string;
  timestamp: string;
  privacy_routed?: boolean;
};

export type AuraMessage = {
  type: "user_turn" | "assistant_turn" | "tool_call" | "tool_result" | "heartbeat";
  timestamp: string;
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: Record<string, unknown>;
  cost_lamports?: number;
  tx_signature?: string;
};

export type FleetMessage = {
  robot_id: RobotId | string;
  type: "telemetry" | "compliance" | "payment" | "status_change";
  payload: Record<string, unknown>;
};

export type ConnStatus = "connecting" | "connected" | "disconnected";
