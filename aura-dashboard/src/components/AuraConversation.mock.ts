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

const now = () => new Date().toISOString();

export const mockMessages: AuraMessage[] = [
  {
    type: "user_turn",
    timestamp: now(),
    content: "Aura, status check on the fleet.",
  },
  {
    type: "tool_call",
    timestamp: now(),
    content: "{}",
    tool_name: "get_fleet_status",
  },
  {
    type: "tool_result",
    timestamp: now(),
    content: "3 robots online. 1 anomaly on robot_02.",
    tool_name: "get_fleet_status",
  },
  {
    type: "assistant_turn",
    timestamp: now(),
    content:
      "All three robots online. Robot 1 grade A, healthy. Robot 2 grade C, one open anomaly. Robot 3 idle.",
  },
  {
    type: "user_turn",
    timestamp: now(),
    content: "Investigate the joint 3 anomaly.",
  },
  {
    type: "assistant_turn",
    timestamp: now(),
    content:
      "That call to GPT-4o for anomaly diagnosis will cost about half a cent of SOL. Proceed?",
  },
  {
    type: "user_turn",
    timestamp: now(),
    content: "Go.",
  },
  {
    type: "tool_call",
    timestamp: now(),
    content: '{"robot_id":"robot_02","event_id":"5xK..."}',
    tool_name: "investigate_anomaly",
    cost_lamports: 800_000,
    tx_signature: "5KQp7VbFqJwzWxN3nMRpRZA8uYbLxK3VtT9aP6cD2RhMeF8jY7nUpQwXsR4oP9zAmK8L3vT2yN5",
  },
];
