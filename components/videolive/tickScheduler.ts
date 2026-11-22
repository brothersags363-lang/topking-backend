// @ts-nocheck



// One shared timer for all slow, always-on host/viewer maintenance jobs
// (heartbeat, reward ping, keep-awake, auto video profile, face cycle, no-face ban, guest cleanup).
// Jobs run on a global 5s grid; each job runs every `everyMs` (rounded to a multiple of 5s).
// Only ONE setTimeout is alive at a time, and it sleeps until the next job is actually due.
export const GRID = 5000;
export type Task = { every: number; fn: () => void };
export const tasks = new Set<Task>();
export let timer: any = null;
export let pendingIdx = 0;
export let lastFired = 0;

export const gridIndex = (t: number) => Math.floor(t / GRID);

export function schedule() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (tasks.size === 0) return;
  const now = Date.now();
  const from = Math.max(gridIndex(now) + 1, lastFired + 1);
  let best = Infinity;
  tasks.forEach((t) => {
    let n = from;
    const r = n % t.every;
    if (r) n += t.every - r;
    if (n < best) best = n;
  });
  pendingIdx = best;
  timer = setTimeout(fire, Math.max(50, best * GRID - now));
}

export function fire() {
  timer = null;
  const g = pendingIdx;
  lastFired = g;
  Array.from(tasks).forEach((t) => {
    if (g % t.every === 0) {
      try { t.fn(); } catch (e) {}
    }
  });
  schedule();
}

export function registerTick(_id: string, everyMs: number, fn: () => void): () => void {
  const task: Task = { every: Math.max(1, Math.round(everyMs / GRID)), fn };
  tasks.add(task);
  schedule();
  return () => {
    tasks.delete(task);
    schedule();
  };
}
