// expo-av ka replacement (expo-av SDK 54 me remove ho raha hai).
// Ye file expo-audio ke upar wahi purana `Audio` API deti hai jo aapke pages
// pehle se use karte hain (Audio.Sound.createAsync, Audio.Recording.createAsync,
// Audio.setAudioModeAsync, Audio.requestPermissionsAsync), isliye pages ka
// code change nahi karna padta - sirf import badalna hota hai:
//   import { Audio } from "../utils/audio";

import { Platform } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

// --------------------------------------------------
// SOUND (playback)
// --------------------------------------------------

function toStatus(player) {
  return {
    isLoaded: !!player.isLoaded,
    isPlaying: !!player.playing,
    positionMillis: Math.round((player.currentTime || 0) * 1000),
    durationMillis: Math.round((player.duration || 0) * 1000),
    isLooping: !!player.loop,
    volume: player.volume,
    didJustFinish: false,
  };
}

class Sound {
  constructor(player, updateCb) {
    this._player = player;
    this._released = false;
    this._cb = updateCb || null;
    this._sub = player.addListener("playbackStatusUpdate", (s) => {
      if (!this._cb) return;
      this._cb({
        isLoaded: !!s.isLoaded,
        isPlaying: !!s.playing,
        positionMillis: Math.round((s.currentTime || 0) * 1000),
        durationMillis: Math.round((s.duration || 0) * 1000),
        isLooping: !!player.loop,
        didJustFinish: !!s.didJustFinish,
      });
    });
  }

  static async createAsync(source, initialStatus = {}, onStatusUpdate) {
    const src = typeof source === "string" ? { uri: source } : source;

    const player = createAudioPlayer(src, {
      updateInterval: initialStatus.progressUpdateIntervalMillis || 250,
    });

    if (typeof initialStatus.isLooping === "boolean") {
      player.loop = initialStatus.isLooping;
    }
    if (typeof initialStatus.volume === "number") {
      player.volume = initialStatus.volume;
    }

    const sound = new Sound(player, onStatusUpdate);

    if (initialStatus.shouldPlay) {
      player.play();
    }

    return { sound, status: toStatus(player) };
  }

  setOnPlaybackStatusUpdate(cb) {
    this._cb = cb || null;
  }

  async playAsync() {
    if (this._released) return;
    const p = this._player;
    // gaana khatam ho chuka ho to dobara shuru se chalao
    if (!p.loop && p.duration > 0 && p.currentTime >= p.duration - 0.05) {
      try {
        await p.seekTo(0);
      } catch (e) {}
    }
    p.play();
  }

  async pauseAsync() {
    if (this._released) return;
    this._player.pause();
  }

  async stopAsync() {
    if (this._released) return;
    this._player.pause();
    try {
      await this._player.seekTo(0);
    } catch (e) {}
  }

  async setPositionAsync(ms) {
    if (this._released) return;
    await this._player.seekTo((ms || 0) / 1000);
  }

  async setVolumeAsync(v) {
    if (this._released) return;
    this._player.volume = v;
  }

  async setIsLoopingAsync(loop) {
    if (this._released) return;
    this._player.loop = !!loop;
  }

  async setRateAsync(rate) {
    if (this._released) return;
    this._player.playbackRate = rate;
  }

  async getStatusAsync() {
    if (this._released) return { isLoaded: false };
    return toStatus(this._player);
  }

  async unloadAsync() {
    if (this._released) return;
    this._released = true;
    this._cb = null;
    try {
      this._sub && this._sub.remove();
    } catch (e) {}
    try {
      this._player.remove();
    } catch (e) {}
  }
}

// --------------------------------------------------
// RECORDING (voice record)
// --------------------------------------------------

// expo-audio recorder ko platform-flat options chahiye hote hain
function flattenRecordingOptions(options) {
  const { web, android, ios, ...rest } = options || {};
  const platform = Platform.OS === "ios" ? ios : android;
  return { ...rest, ...(platform || {}) };
}

class Recording {
  constructor(recorder) {
    this._recorder = recorder;
    this._uri = null;
    this._durationMillis = 0;
    this._done = false;
  }

  static async createAsync(options = RecordingPresets.HIGH_QUALITY) {
    const recorder = new AudioModule.AudioRecorder(
      flattenRecordingOptions(options)
    );
    await recorder.prepareToRecordAsync();
    recorder.record();
    const recording = new Recording(recorder);
    return { recording, status: await recording.getStatusAsync() };
  }

  async stopAndUnloadAsync() {
    if (this._done) return;
    const r = this._recorder;

    let before = 0;
    try {
      before = (r.getStatus && r.getStatus().durationMillis) || 0;
    } catch (e) {}

    await r.stop();

    let after = 0;
    try {
      after = (r.getStatus && r.getStatus().durationMillis) || 0;
    } catch (e) {}

    this._uri = r.uri || null;
    this._durationMillis = Math.max(before, after, Math.round((r.currentTime || 0) * 1000));
    this._done = true;
  }

  getURI() {
    return this._done ? this._uri : this._recorder.uri || null;
  }

  async getStatusAsync() {
    if (this._done) {
      return {
        canRecord: false,
        isRecording: false,
        isDoneRecording: true,
        durationMillis: this._durationMillis,
      };
    }
    let durationMillis = 0;
    try {
      durationMillis = this._recorder.getStatus().durationMillis || 0;
    } catch (e) {}
    return {
      canRecord: true,
      isRecording: !!this._recorder.isRecording,
      isDoneRecording: false,
      durationMillis,
    };
  }
}

// --------------------------------------------------
// Audio (expo-av jaisa object)
// --------------------------------------------------

export const Audio = {
  Sound,
  Recording,

  RecordingOptionsPresets: {
    HIGH_QUALITY: RecordingPresets.HIGH_QUALITY,
    LOW_QUALITY: RecordingPresets.LOW_QUALITY,
  },

  async requestPermissionsAsync() {
    return requestRecordingPermissionsAsync();
  },

  // purane expo-av keys ko expo-audio keys me convert karta hai
  async setAudioModeAsync(mode = {}) {
    const next = {};

    if ("playsInSilentModeIOS" in mode) next.playsInSilentMode = !!mode.playsInSilentModeIOS;
    if ("allowsRecordingIOS" in mode) next.allowsRecording = !!mode.allowsRecordingIOS;
    if ("staysActiveInBackground" in mode) next.shouldPlayInBackground = !!mode.staysActiveInBackground;
    if ("playThroughEarpieceAndroid" in mode) next.shouldRouteThroughEarpiece = !!mode.playThroughEarpieceAndroid;

    if ("shouldDuckAndroid" in mode) {
      next.interruptionMode = mode.shouldDuckAndroid ? "duckOthers" : "mixWithOthers";
      next.interruptionModeAndroid = mode.shouldDuckAndroid ? "duckOthers" : "doNotMix";
    }

    try {
      await setAudioModeAsync(next);
    } catch (e) {
      console.log("setAudioModeAsync error:", e);
    }
  },
};

export default Audio;
