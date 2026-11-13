// Chhota event-bus: ShareVideo screen se index screen tak "star received" message pahunchane ke liye.
// Module-level state navigation ke baad bhi bacha rehta hai, isliye index dobara
// mount ho ya pehle se mounted ho, dono me message dikhega.
let pending = null;
const listeners = new Set();

export function showStarToast(text) {
  if (listeners.size > 0) {
    listeners.forEach((fn) => fn(text));
  } else {
    pending = text; // index abhi mount nahi hai -> mount hote hi dikhega
  }
}

export function subscribeStarToast(fn) {
  listeners.add(fn);
  if (pending) {
    const t = pending;
    pending = null;
    fn(t);
  }
  return () => listeners.delete(fn);
}
