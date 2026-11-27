import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import RideEntry, { RIDE_LAYER_H } from './RideEntry';
import CameraShot, { CAMERA_LAYER_H } from './CameraShot';
import { playGiftSound, preloadGiftSounds, stopGiftSound } from './giftSound';

// ---- GAADI KAHAN DIKHE: gift popup ("Aman Sent Rose x1") ke THEEK NEECHE ----
// GiftLayer ka comboBottom (popup neeche se upar badhta hai) ya comboTop (upar se neeche badhta hai) do.
// comboTop wale me popup ki max 3 line ki jagah chhodi jati hai taaki nayi line aaye to bhi gaadi use na dhake.
const POPUP_ROW_H = 52; // ek popup line ki unchai (avatar/gift 46 + gap)
const POPUP_MAX_ROWS = 3;
const GAP = 6;
export function rideTopBelowPopup(comboTop, comboBottom) {
  const H = Dimensions.get('window').height;
  let top;
  if (comboBottom != null) top = H - comboBottom + GAP;
  else top = (comboTop != null ? comboTop : H * 0.25) + POPUP_ROW_H * POPUP_MAX_ROWS + GAP;
  // screen ke bahar na jaye
  return Math.max(0, Math.min(top, H - Math.max(RIDE_LAYER_H, CAMERA_LAYER_H) - 8));
}

// ============================================================
// GIFT SHOW - live room me bade gift ka chalta firta animation (popup ke neeche):
//   car3d  (Sports Car) -> chalti firti gaadi (RideEntry.js)
//   camera (Camera)     -> 3 click, poori screen flash, 3 photo (CameraShot.js)
// GiftLayer ke showCombo se push(data) hota hai. Sirf transform/opacity animation => smooth.
//   - Ek hi banda tez tez tap kare (x2, x3 ...) to gaadi DOBARA nahi chalti, ek hi baar.
//   - Alag alag log ek saath bheje to line me (max 3 intezaar me), ek ke baad ek.
// Naya gaadi wala gift jodna ho: RIDE_GIFTS me gift id + image daalo (image ka muh LEFT taraf).
// ============================================================
export const RIDE_GIFTS = {
  car3d: { type: 'car', img: require('../../assets/gifts/car.webp'), name: 'Sports Car' },
  camera: { type: 'camera', name: 'Camera' },
};
export const isRideGift = (id) => !!RIDE_GIFTS[String(id)];

const MAX_WAIT = 3;
let seq = 0;

// top: gaadi kahan dikhe (live room me seats ke theek niche wala y). Na do to screen ka 36%.
const CarGiftRide = forwardRef(function CarGiftRide({ top }, ref) {
  const [cur, setCur] = useState(null);
  const curRef = useRef(null);
  const queue = useRef([]);
  const alive = useRef(true);
  useEffect(() => {
    preloadGiftSounds(); // room khulte hi awaaz ready
    return () => {
      alive.current = false;
      stopGiftSound('car');
      stopGiftSound('camera');
    };
  }, []);

  // naya animation shuru -> uski awaaz bhi saath me (car: engine/brake, camera: 3 click)
  useEffect(() => {
    if (!cur) return;
    const g = RIDE_GIFTS[String(cur.giftId)];
    if (g) playGiftSound(g.type);
  }, [cur && cur._k]);

  const start = useCallback((item) => {
    curRef.current = item;
    setCur(item);
  }, []);

  useImperativeHandle(ref, () => ({
    push(data) {
      if (!data || !isRideGift(data.giftId)) return;
      const who = String(data.senderId || data.senderName || '');
      const same = (x) => x && String(x.senderId || x.senderName || '') === who && String(x.giftId) === String(data.giftId);
      // combo tap (x2, x3...) => wahi gaadi chal rahi / line me hai, dobara nahi
      if (same(curRef.current) || queue.current.some(same)) return;
      const item = { ...data, _k: 'ride' + ++seq };
      if (!curRef.current) start(item);
      else if (queue.current.length < MAX_WAIT) queue.current.push(item);
    },
  }), [start]);

  const onDone = useCallback(() => {
    if (!alive.current) return;
    const next = queue.current.shift() || null;
    curRef.current = next;
    setCur(next);
  }, []);

  if (!cur) return null;
  const g = RIDE_GIFTS[String(cur.giftId)] || RIDE_GIFTS.car3d;
  if (g.type === 'camera') {
    return <CameraShot key={cur._k} data={cur} top={top} onDone={onDone} />;
  }
  const to = cur.receiverName ? `${cur.receiverName} ko ` : '';
  return (
    <RideEntry
      key={cur._k}
      mode="gift"
      top={top}
      tier={30}
      source={g.img}
      subText={`${to}${cur.giftName || g.name} bheji`}
      data={{
        _k: cur._k,
        senderName: cur.senderName,
        userImg: cur.senderImg,
        senderId: cur.senderId,
        level: cur.level,
        verified: cur.verified,
        verifiedColor: cur.verifiedColor,
      }}
      onDone={onDone}
    />
  );
});

export default memo(CarGiftRide);
