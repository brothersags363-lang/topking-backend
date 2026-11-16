import { useEffect, useState } from 'react';
import { PLAIN_JOIN_MS } from './JoinEntry';

// Lv 35 se niche ki NAYI join line chat me turant nahi dikhti: pehle upar wali pill 3.5 sec dikhti hai,
// uske baad ye line chat me aati hai. Purani history / 35+ users par koi delay nahi.
//
// Room ka chat listener jab koi NAYI join line pakde to markJoinPending(doc.id) bulaye
// (phone ki clock par depend nahi karta). Na bulaye to purana clock wala check chalta hai.
const pending = new Map(); // chatId -> time jab pill shuru hui
export const markJoinPending = (id) => {
  if (id) pending.set(String(id), Date.now());
};
const stillPending = (id) => {
  const t = id ? pending.get(String(id)) : null;
  return !!t && Date.now() - t < PLAIN_JOIN_MS + 300;
};

export const useJoinDelay = (chat) => {
  const low = chat && chat.type === 'join' && (Number(chat.level) || 1) < 35;
  const fresh =
    low &&
    (stillPending(chat.id) || Math.abs(Date.now() - (chat.createdAt || 0)) < 15000);
  const [wait, setWait] = useState(!!fresh);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(false), PLAIN_JOIN_MS + 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return wait;
};
