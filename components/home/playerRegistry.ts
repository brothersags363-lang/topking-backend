import { stopWarmAhead } from '../../utils/warmAhead';
import React from 'react';


// ======================================================
// AUDIO FIX: sab feed players ek registry me.
// Swipe par pichhle video ki awaaz React re-render ka intezaar nahi
// karti -> turant (synchronously) band/mute hoti hai.
// ======================================================
export const feedPlayers = new Map<string, any>();

// activeId ke alawa sab players turant pause + mute
export const silenceOthers = (activeId: string | null | undefined) => {
  feedPlayers.forEach((p, id) => {
    if (id === activeId) return;
    try { p.muted = true; } catch (e) {}
    try { p.pause(); } catch (e) {}
  });
};

// FOCUS GUARD: feed screen jab focus me NAHI hai to koi bhi code video play
// na kar sake. Blur hote hi sab players turant pause + mute.
export let feedFocused = true;
export const setFeedFocused = (v: boolean) => {
  feedFocused = v;
  if (!v) silenceOthers(null); // null = koi exception nahi -> sab band
  if (!v) stopWarmAhead(); // dusre page par ho to peeche ka prefetch bhi band
};

// INSTA: swipe par naya video React re-render ka wait kiye bina TURANT chalu
// (registry ke player par seedha unmute + play)
export const playActiveNow = (activeId: string | null | undefined) => {
  if (!activeId || !feedFocused) return;
  const p = feedPlayers.get(activeId);
  if (!p) return;
  try { p.muted = false; } catch (e) {}
  try { p.play(); } catch (e) {}
};

// Sirf awaaz band/chalu (video wahi rahe) -> swipe ke beech me halka
export const setActiveMuted = (activeId: string | null | undefined, muted: boolean) => {
  if (!activeId) return;
  const p = feedPlayers.get(activeId);
  if (!p) return;
  try { p.muted = muted; } catch (e) {}
};

