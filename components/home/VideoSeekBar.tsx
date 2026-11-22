import { memo, useRef, useState, useEffect } from 'react';
import { View, Text, PanResponder } from 'react-native';
import { width } from './feedShared';
import { seekTarget, seekListeners, fmtTime } from './seekRegistry';
import { styles } from './feedStyles';

export const VideoSeekBar = memo(function VideoSeekBar() {
  const [target, setTarget] = useState(seekTarget);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [dragging, setDragging] = useState(false);

  const targetRef = useRef(seekTarget);
  const durRef = useRef(0);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const barWidthRef = useRef(width);
  const lastSeekAtRef = useRef(0);

  // Active video badalte hi naya player pakdo
  useEffect(() => {
    const fn = () => {
      targetRef.current = seekTarget;
      durRef.current = 0;
      setTarget(seekTarget);
      setPos(0);
      setDur(0);
    };
    seekListeners.add(fn);
    return () => {
      seekListeners.delete(fn);
    };
  }, []);

  // Video ke hisaab se line aage badhe (sirf ye chhota component re-render hota hai)
  useEffect(() => {
    if (!target) return;
    const p = target.player;
    const tick = () => {
      try {
        const d = p.duration || 0;
        if (d !== durRef.current) {
          durRef.current = d;
          setDur(d);
        }
        if (!draggingRef.current) setPos(p.currentTime || 0);
      } catch (e) {}
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [target]);

  const seekTo = (x: number, force: boolean) => {
    const d = durRef.current;
    const p = targetRef.current?.player;
    if (!d || !p) return;
    const ratio = Math.min(1, Math.max(0, x / (barWidthRef.current || width)));
    const t = ratio * d;
    setPos(t);
    const now = Date.now();
    if (force || now - lastSeekAtRef.current > 80) {
      lastSeekAtRef.current = now;
      try { p.currentTime = t; } catch (e) {}
    }
  };

  const finishDrag = (x: number) => {
    seekTo(x, true);
    draggingRef.current = false;
    setDragging(false);
    try {
      if (wasPlayingRef.current) targetRef.current?.player.play();
    } catch (e) {}
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!targetRef.current && durRef.current > 0,
      onMoveShouldSetPanResponder: () => !!targetRef.current && durRef.current > 0,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        draggingRef.current = true;
        setDragging(true);
        try {
          const p = targetRef.current?.player;
          wasPlayingRef.current = !!p?.playing;
          p?.pause();
        } catch (err) {}
        seekTo(e.nativeEvent.pageX, true);
      },
      onPanResponderMove: (_, g) => seekTo(g.moveX, false),
      onPanResponderRelease: (_, g) => finishDrag(g.moveX),
      onPanResponderTerminate: (_, g) => finishDrag(g.moveX),
    })
  ).current;

  const ratio = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <View
      style={styles.seekWrap}
      onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
    >
      {/* time: sirf aage-peeche karte waqt dikhega */}
      {dragging && dur > 0 ? (
        <View style={styles.seekTimeBox} pointerEvents="none">
          <Text style={styles.seekTimeBig}>
            {fmtTime(pos)} / {fmtTime(dur)}
          </Text>
        </View>
      ) : null}

      {/* peela line: menu ke upar se chipka */}
      <View style={[styles.seekTrack, dragging && styles.seekTrackActive]} pointerEvents="none">
        <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
      </View>
      {dragging ? (
        <View
          pointerEvents="none"
          style={[styles.seekThumb, { left: `${ratio * 100}%` }]}
        />
      ) : null}
    </View>
  );
});

