import { monitorTdsCreditThreshold } from "../server.js";
import { config } from "../config.js";
import { registerInterval } from "./scheduler.js";

export function registerTdsCreditAlertJob() {
  if (!Number.isFinite(config.tdsCreditAlertIntervalMs) || config.tdsCreditAlertIntervalMs <= 0) return;
  registerInterval(monitorTdsCreditThreshold, config.tdsCreditAlertIntervalMs, {
    runImmediately: true,
    label: "tds credit alert",
  });
}
