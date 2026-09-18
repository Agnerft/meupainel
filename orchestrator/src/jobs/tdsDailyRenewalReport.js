import { monitorTdsDailyRenewalReport } from "../server.js";
import { config } from "../config.js";
import { registerInterval } from "./scheduler.js";

export function registerTdsDailyRenewalReportJob() {
  if (!Number.isFinite(config.tdsDailyRenewalReportIntervalMs) || config.tdsDailyRenewalReportIntervalMs <= 0) return;
  registerInterval(monitorTdsDailyRenewalReport, config.tdsDailyRenewalReportIntervalMs, {
    runImmediately: true,
    label: "tds daily renewal report",
  });
}
