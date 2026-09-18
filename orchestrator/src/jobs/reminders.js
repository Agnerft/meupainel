import { dispatchDueReminders } from "../server.js";
import { REMINDER_CHECK_INTERVAL_MS } from "../config.js";
import { registerInterval } from "./scheduler.js";

export function registerReminderJob() {
  registerInterval(dispatchDueReminders, REMINDER_CHECK_INTERVAL_MS, { label: "reminder dispatch" });
}
