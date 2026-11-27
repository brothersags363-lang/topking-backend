import PERF from '../../utils/devicePerf';
import { isHlsUri, fixCdn } from '../../utils/videoSource';
import { memo, useRef, useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { useEvent } from 'expo';
import { videoPositions } from './feedStorage';
import { seekTarget, setSeekTarget } from './seekRegistry';
import { feedPlayers, feedFocused } from './playerRegistry';
import { styles } from './feedStyles';

export const FeedVideo = memo(
function FeedVideo({ uri, active, thumbnail, near, videoId, isCurrent }) {

  // Thumbnail tab tak dikhta hai jab tak video ka pehla frame na aa jaye
  const [ready, setReady] = useState(false);

  // useCaching: video phone me cache hota hai -> loop / dubara dekhne par
  // dobara download nahi, loop point par atakna nahi.
  // HLS (.m3u8) par disk-cache nahi lagta (sirf mp4 par); HLS khud segment cache karta hai.
  const source = useMemo(() => ({ uri, useCaching: !isHlsUri(uri) }), [uri]);

  // Pichli baar jaha roka tha (seconds) -> wahi se start
  const resumeAtRef = useRef(videoPositions[videoId] || 0);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.bufferOptions = PERF.cfg().buffers.preload;
    if (resumeAtRef.current > 0.5) {
      try { p.currentTime = resumeAtRef.current; } catch (e) {}
    }
  });

  // Registry me daalo / hatao
  useEffect(() => {
    if (!videoId) return;
    feedPlayers.set(videoId, player);
    return () => {
      try { player.muted = true; } catch (e) {}
      try { player.pause(); } catch (e) {}
      if (feedPlayers.get(videoId) === player) feedPlayers.delete(videoId);
    };
  }, [player, videoId]);

  // Agar player ready hone par position set nahi hui to ek baar aur seek
  useEffect(() => {
    const target = resumeAtRef.current;
    if (!(target > 0.5)) return;

    const trySeek = () => {
      try {
        if (Math.abs(player.currentTime - target) > 1) {
          player.currentTime = target;
        }
      } catch (e) {}
      resumeAtRef.current = 0;
    };

    if (player.status === 'readyToPlay') {
      trySeek();
      return;
    }

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && resumeAtRef.current > 0.5) {
        trySeek();
      }
    });
    return () => sub.remove();
  }, [player]);

  // Niche wali seek bar ko batao ki abhi kaunsa video current hai
  useEffect(() => {
    if (!isCurrent) return;
    setSeekTarget({ player, videoId });
    return () => {
      if (seekTarget && seekTarget.player === player) setSeekTarget(null);
    };
  }, [isCurrent, player, videoId]);

  // Chalte waqt har 1 sec me position yaad rakho (band/pause/screen change par bhi save)
  useEffect(() => {
    if (!active || !videoId) return;
    const save = () => {
      try {
        const c = player.currentTime;
        if (c > 0) videoPositions[videoId] = c;
      } catch (e) {}
    };
    // WATCHDOG: active video data ready hone ke baad bhi ruka ho (audio focus /
    // decoder hiccup / rebuffer ke baad) to khud dobara play karo.
    // Tap se pause hone par `active` false hota hai, isliye wo yahan nahi chhedta.
    const nudge = () => {
      try {
        if (!feedFocused) return;
        if (player.status === 'readyToPlay' && !player.playing) player.play();
      } catch (e) {}
    };
    const t = setInterval(() => {
      save();
      nudge();
    }, 1000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [active, player, videoId]);

  // App background se wapas aane par video khud dobara chale
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && feedFocused) {
        try { player.play(); } catch (e) {}
      }
    });
    return () => sub.remove();
  }, [active, player]);

  // Buffer settings alag effect me: sirf buffer badalna hai, play/pause/seek nahi.
  useEffect(() => {
    const B = PERF.cfg().buffers;
    player.bufferOptions = active ? B.active : near ? B.near : B.preload;
  }, [active, near, player]);

  // SPEED FIX: pehle har baar (even preload hote waqt) currentTime = 0 seek
  // hota tha, jisse buffer reset ho sakta tha. Ab sirf tab reset hota hai
  // jab video pehle chal chuka ho aur ab scroll karke nikal gaya ho.
  // Sirf play / pause. (Pehle yahan pause hote hi video 0 par chala jata tha -
  // isi wajah se screen badalne / tap-pause ke baad video shuru se start hota tha.)
  useEffect(() => {
    if (active && feedFocused) {
      try { player.muted = false; } catch (e) {}
      player.play();
    } else {
      // inactive: pehle mute (turant), phir pause
      try { player.muted = true; } catch (e) {}
      player.pause();
    }
  }, [active, player]);

  // Video 0 par TABHI jaye jab user usse scroll karke aage/peeche nikal jaye
  // SMOOTH: seek(0) swipe animation ke BEECH me nahi hota (decoder ka kaam
  // scroll se ladta tha) -> swipe settle hone ke baad hota hai.
  const wasCurrentRef = useRef(false);
  useEffect(() => {
    if (isCurrent) {
      wasCurrentRef.current = true;
      return;
    }
    if (!wasCurrentRef.current) return;
    wasCurrentRef.current = false;
    delete videoPositions[videoId];
    const t = setTimeout(() => {
      try { player.currentTime = 0; } catch (e) {}
    }, 400);
    return () => clearTimeout(t); // user turant wapas aaya to reset nahi
  }, [isCurrent, player, videoId]);

  // NET METER: active hone ke baad pehla frame aane me kitna time laga.
  // Bar-bar 2.5 sec se zyada laga to net kamzor maana jata hai -> agle videos halki quality me.
  const activeAtRef = useRef(0);
  const readyRef = useRef(false);
  useEffect(() => {
    if (active && !readyRef.current) activeAtRef.current = Date.now();
    else if (!active) activeAtRef.current = 0;
  }, [active]);
  const onFirstFrame = () => {
    readyRef.current = true;
    if (activeAtRef.current) {
      try { PERF.reportStartup(Date.now() - activeAtRef.current); } catch (e) {}
      activeAtRef.current = 0;
    }
    setReady(true);
  };

  // Buffering ho rahi ho to chhota spinner dikhao (frozen frame nahi lagega)
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  // chalte-chalte ruka (pehla frame aa chuka tha) = asli "atakna"
  const isBuffering = active && ready && status === 'loading';

  // Atakna ginte hain: bar-bar ho to net "kamzor" maana jata hai -> agle videos halki quality.
  useEffect(() => {
    if (isBuffering) PERF.reportStall();
  }, [isBuffering]);

  // NET GAYA / AAYA: pehle video 'error' me hamesha ke liye atak jaati thi (net wapas aane par
  // bhi kaala/ruka). Ab active video khud dobara try karti hai: 1.5s, 3s, 6s, phir har 8s.
  const retryRef = useRef(0);
  useEffect(() => {
    if (status === 'readyToPlay') retryRef.current = 0;
    if (status !== 'error' || !active) return;
    const n = retryRef.current++;
    const delay = Math.min(8000, 1500 * Math.pow(2, n));
    const t = setTimeout(() => {
      try {
        const r = typeof player.replaceAsync === 'function'
          ? player.replaceAsync(source)
          : player.replace(source);
        Promise.resolve(r)
          .then(() => { if (feedFocused) { try { player.muted = false; player.play(); } catch (e) {} } })
          .catch(() => {});
      } catch (e) {}
    }, delay);
    return () => clearTimeout(t);
  }, [status, active, player, source]);

  // Spinner: active video load ho rahi ho (pehli baar bhi) ya dobara try ho rahi ho.
  // 500ms ruk ke dikhao -> jaldi load ho jaye to spinner flash nahi hota.
  const wantSpin = active && (status === 'loading' || status === 'error');
  const [showSpin, setShowSpin] = useState(false);
  useEffect(() => {
    if (!wantSpin) { setShowSpin(false); return; }
    const t = setTimeout(() => setShowSpin(true), 500);
    return () => clearTimeout(t);
  }, [wantSpin]);

  return (
    <>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="cover"
        // Android: SurfaceView scroll me black flash deta hai -> TextureView
        surfaceType="textureView"
        useExoShutter={false}
        onFirstFrameRender={onFirstFrame}
      />
      {!ready && thumbnail ? (
        <ExpoImage source={fixCdn(thumbnail)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} pointerEvents="none" />
      ) : null}
      {showSpin ? (
        <View style={styles.bufferSpinner} pointerEvents="none">
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      ) : null}
    </>
  );
},

(prevProps, nextProps) => {
  return (
    prevProps.uri === nextProps.uri &&
    prevProps.active === nextProps.active &&
    prevProps.near === nextProps.near &&
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.videoId === nextProps.videoId &&
    prevProps.thumbnail === nextProps.thumbnail
  );
}

);


