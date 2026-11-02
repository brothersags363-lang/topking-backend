// utils/useSwipeTabs.js — left/right swipe se tabs badlo (FAST version)
// Order: Discover | Follow | For You
//   swipe right -> pichla tab, swipe left -> agla tab
//
// Pehle: 60px chalna + release ka wait + bahut seedhi (horizontal) swipe chahiye thi -> bhaari lagta tha.
// Ab:
//   - swipe jaldi pakadta hai (10px), thodi tirchhi swipe bhi chalti hai
//   - finger 40px chalte hi tab TURANT badal jata hai (release ka wait nahi)
//   - chhoti tez flick (velocity) par bhi badal jata hai
//   - ek swipe = ek hi baar tab badle (double fire / bounce nahi)
// Vertical video scroll par asar nahi: sirf tab pakadta hai jab dx, dy se kaafi zyada ho.
import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

const START_DX = 10;     // itna hilte hi horizontal swipe maana jayega
const H_RATIO = 1.6;     // dx, dy se is guna zyada ho (vertical scroll na bigde)
const TRIGGER_DX = 40;   // finger itna chale to turant tab badlo
const FAST_VX = 0.22;    // tez flick (px/ms)
const FAST_DX = 18;      // flick me kam se kam itna chalna chahiye
const LOCK_MS = 280;     // ek swipe ke baad itni der dobara trigger nahi

export default function useSwipeTabs({ onSwipeLeft, onSwipeRight }) {
  const left = useRef(onSwipeLeft);
  const right = useRef(onSwipeRight);
  left.current = onSwipeLeft;
  right.current = onSwipeRight;

  const firedRef = useRef(false);
  const lastRef = useRef(0);

  return useMemo(() => {
    const fire = (dx) => {
      if (firedRef.current) return;
      const now = Date.now();
      if (now - lastRef.current < LOCK_MS) return;
      firedRef.current = true;
      lastRef.current = now;
      if (dx < 0) left.current && left.current();
      else right.current && right.current();
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > START_DX && Math.abs(g.dx) > Math.abs(g.dy) * H_RATIO,
      onPanResponderGrant: () => {
        firedRef.current = false;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) > TRIGGER_DX && Math.abs(g.dx) > Math.abs(g.dy) * H_RATIO) fire(g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.vx) > FAST_VX && Math.abs(g.dx) > FAST_DX && Math.abs(g.dx) > Math.abs(g.dy)) fire(g.dx);
      },
    }).panHandlers;
  }, []);
}
