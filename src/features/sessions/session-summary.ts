// src/features/sessions/session-summary.ts
import type { SessionSummary } from "@/src/features/sessions/types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Derive display fields for a session card from its summary.
 * `windowCount` is the node count; `editedLabel` is a coarse relative-time string
 * (>7 days falls back to the ISO date). `now` defaults to Date.now().
 */
export function summarizeSession(
  summary: SessionSummary,
  now: number = Date.now(),
): { windowCount: number; editedLabel: string } {
  const editedAt = Date.parse(summary.updatedAt);
  const delta = now - editedAt;

  let editedLabel: string;
  if (delta < MINUTE_MS) {
    editedLabel = "just now";
  } else if (delta < HOUR_MS) {
    editedLabel = `${Math.floor(delta / MINUTE_MS)}m ago`;
  } else if (delta < DAY_MS) {
    editedLabel = `${Math.floor(delta / HOUR_MS)}h ago`;
  } else if (delta < WEEK_MS) {
    editedLabel = `${Math.floor(delta / DAY_MS)}d ago`;
  } else {
    editedLabel = summary.updatedAt.slice(0, 10);
  }

  return { windowCount: summary.nodeCount, editedLabel };
}
