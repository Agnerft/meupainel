export function registerInterval(fn, intervalMs, { runImmediately = false, label } = {}) {
  const timer = setInterval(() => {
    fn().catch((error) => console.error(`${label || fn.name} failed`, error));
  }, intervalMs);
  timer.unref?.();
  if (runImmediately) {
    fn().catch((error) => console.error(`${label || fn.name} initial run failed`, error));
  }
  return timer;
}
