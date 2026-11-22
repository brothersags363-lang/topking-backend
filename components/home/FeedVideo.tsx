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

  // Buffering ho rahi ho to chhota spinner dikhao (frozen frame nahi lagega)
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const isBuffering = active && ready && status === 'loading';

  // Atakna ginte hain: bar-bar ho to PERF khud ek tier neeche kar deta hai (weak phone / slow net).
  useEffect(() => {
    if (isBuffering) PERF.reportStall();
  }, [isBuffering]);

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
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready && thumbnail ? (
        <ExpoImage source={fixCdn(thumbnail)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} pointerEvents="none" />
      ) : null}
      {isBuffering ? (
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


