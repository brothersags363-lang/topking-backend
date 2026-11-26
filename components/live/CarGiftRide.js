import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import RideEntry from './RideEntry';

// ============================================================
// CAR GIFT RIDE - live room me "Sports Car" gift aaye to poori screen par chalti firti gaadi.
// GiftLayer ke showCombo se push(data) hota hai. Sirf transform/opacity animation => smooth.
//   - Ek hi banda tez tez tap kare (x2, x3 ...) to gaadi DOBARA nahi chalti, ek hi baar.
//   - Alag alag log ek saath bheje to line me (max 3 intezaar me), ek ke baad ek.
// Naya gaadi wala gift jodna ho: RIDE_GIFTS me gift id + image daalo (image ka muh LEFT taraf).
// ============================================================
export const RIDE_GIFTS = {
  car3d: { img: require('../../assets/gifts/car.webp'), name: 'Sports Car' },
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
  useEffect(() => () => { alive.current = false; }, []);

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
