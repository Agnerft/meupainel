import { registerReminderJob } from "./reminders.js";
import { registerTdsCreditAlertJob } from "./tdsCreditAlert.js";
import { registerTdsDailyRenewalReportJob } from "./tdsDailyRenewalReport.js";
import { registerHourlyRankJob } from "./hourlyRank.js";
import { registerAdsRankJob } from "./adsRank.js";

export function startJobs() {
  registerReminderJob();
  registerTdsCreditAlertJob();
  registerTdsDailyRenewalReportJob();
  registerHourlyRankJob();
  registerAdsRankJob();
}
