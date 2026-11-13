// components/ScreenDepthGate.tsx
// MEMORY FIX: Stack me jitni screens upar-neeche khulti jati hain, sab mounted rehti hain
// (timers, Firestore listeners, video, images sab chalte rehte hain).
// Ye wrapper har screen ko batata hai ki wo top se kitni neeche hai.
// Sirf upar ki MAX_MOUNTED screens mounted rehti hain; usse neeche wali unmount ho jati hain
// (khali View dikhti hai) aur back karke wapas aane par FRESH khulti hain.
//
// PROTECTED screens (live / camera / editor) kabhi unmount nahi hoti, kyunki unmount par
// unka cleanup chalta hai (Agora band, room leave, adhura kaam/upload chala jana).
import React from 'react';
import { View } from 'react-native';
import { useNavigationState } from '@react-navigation/native';

// Top screen + uske neeche 2 = total 3 pages memory me
export const MAX_MOUNTED = 3;

// route.name (file name) me ye text aaye to screen protected hai (lowercase compare)
const PROTECTED = [
  'liveroom',
  'liveprivate',
  'multiguestroom',
  'videolive',
  'livevideostart',
  'livestart',
  'openlive',
  'camera',
  'post',
  'story-editor',
  'videoedite',
  'editview',
  'musicselect',
  'withdrawals',
  'wallet',
];

function isProtected(name: string) {
  const n = String(name || '').toLowerCase();
  return PROTECTED.some((p) => n === p || n.endsWith('/' + p));
}

type Props = {
  route: { key: string; name: string };
  children: React.ReactNode;
};

export default function ScreenDepthGate({ route, children }: Props) {
  // 0 = sabse upar wali screen, 1 = uske neeche, ...
  const depth = useNavigationState((state: any) => {
    const i = state.routes.findIndex((r: any) => r.key === route.key);
    return i < 0 ? 0 : state.routes.length - 1 - i;
  });

  const keep = depth < MAX_MOUNTED || isProtected(route.name);

  if (!keep) {
    // Unmounted: kuch bhi memory nahi leta. Wapas upar aane par children fresh mount honge.
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  return <>{children}</>;
}
