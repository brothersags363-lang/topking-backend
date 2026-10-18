import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  writeBatch,
  increment,
  serverTimestamp,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';

export type Hashtag = { id: string; name: string; uses: number };

// In characters ko hashtag ka hissa nahi maante (space, punctuation, symbols).
// Property escapes (\p{L}) jaan-boojh kar nahi use kiye: Hindi/Bhojpuri ki
// matras (\p{M}) unme nahi aati aur shabd beech me toot jata.
const INVALID_CHARS = ' \\t\\n\\r#.,!?;:\'"()\\[\\]{}<>@$%^&*+=|\\\\/~`';
const INVALID_RE = new RegExp(`[${INVALID_CHARS}]`, 'g');
const TAG_RE_SOURCE = `#([^${INVALID_CHARS}]+)`;

const MAX_TAG_LENGTH = 50;

/** "#Hello World" -> "helloworld" (safe Firestore doc id + search key) */
export const cleanTag = (t: string): string =>
  String(t || '')
    .replace(INVALID_RE, '')
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);

/** Caption se unique hashtags nikalta hai (lowercase, '#' ke bina). */
export const extractHashtags = (text = ''): string[] => {
  const re = new RegExp(TAG_RE_SOURCE, 'g');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = cleanTag(m[1]);
    if (tag) out.add(tag);
  }
  return [...out];
};

/** 1200 -> 1.2K, 3400000 -> 3.4M */
export const formatCount = (n: number): string => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
};

/**
 * Realtime listener: app ke top hashtags (zyada use wale pehle).
 * Jaise hi koi naya video post karta hai, count apne aap update hota hai.
 */
export function subscribeHashtags(
  db: Firestore,
  onData: (list: Hashtag[]) => void,
  onError?: (e: unknown) => void,
  max = 300
): Unsubscribe {
  const q = query(collection(db, 'hashtags'), orderBy('uses', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => {
      const seen = new Set<string>();
      const list: Hashtag[] = [];
      snap.docs.forEach((d) => {
        const data: any = d.data();
        const name = cleanTag(data?.name ?? d.id);
        if (!name || seen.has(name)) return;
        seen.add(name);
        list.push({ id: d.id, name, uses: Number(data?.uses || 0) });
      });
      onData(list);
    },
    (e) => onError?.(e)
  );
}

/**
 * Video upload SUCCESS hone ke baad ek baar call karo.
 * - Hashtag pehle se hai  -> uses +1
 * - Hashtag naya hai      -> naya doc banta hai (uses = 1)
 * Ek hi batch me hota hai, isliye fast aur atomic.
 */
export async function registerHashtags(db: Firestore, tags: string[]): Promise<void> {
  const unique = [...new Set((tags || []).map(cleanTag).filter(Boolean))];
  if (!unique.length) return;

  const batch = writeBatch(db);
  unique.forEach((tag) => {
    batch.set(
      doc(db, 'hashtags', tag),
      { name: tag, uses: increment(1), lastUsedAt: serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
}
