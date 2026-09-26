import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';

export type UploadResult = { videoUrl: string; thumbnailUrl?: string };

const API = 'https://topking-backend.onrender.com';
const MAX_RETRIES = 3;
const STATE_KEY = 'topking_upload_state_v2';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeUri = (uri: string) =>
  Platform.OS === 'android' ? uri : uri.replace(/^file:\/\//, '');

async function withRetry<T>(fn: () => Promise<T>, onRetry?: (attempt: number) => void): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (attempt === MAX_RETRIES) break;
      onRetry?.(attempt);
      await sleep(600 * attempt);
    }
  }
  throw last;
}

export async function saveUploadState(state: Record<string, unknown>) {
  try { await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

export async function clearUploadState() {
  try { await AsyncStorage.removeItem(STATE_KEY); } catch {}
}

export async function uploadVideo(options: {
  uri: string;
  token: string;
  onProgress?: (percent: number) => void;
}): Promise<UploadResult> {
  const { uri, token, onProgress } = options;
  await saveUploadState({ uri, startedAt: Date.now(), status: 'uploading' });

  const form = new FormData();
  form.append('video', {
    uri: normalizeUri(uri),
    type: 'video/mp4',
    name: `reel-${Date.now()}.mp4`,
  } as any);

  const response = await withRetry(
    () => axios.post(`${API}/upload-video`, form, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10 * 60 * 1000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: e => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
    }),
    attempt => onProgress?.(Math.max(1, Math.min(99, attempt * 3))),
  );

  if (!response.data?.success || !response.data?.videoUrl) {
    throw new Error(response.data?.error || 'Video upload failed');
  }

  const result = { videoUrl: response.data.videoUrl, thumbnailUrl: response.data.thumbnailUrl };
  await clearUploadState();
  onProgress?.(100);
  return result;
}

export async function processVideo(form: FormData, token: string, onProgress?: (percent: number) => void) {
  await saveUploadState({ startedAt: Date.now(), status: 'processing' });
  const response = await withRetry(() => axios.post(`${API}/merge`, form, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10 * 60 * 1000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    onUploadProgress: e => {
      if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 70));
    },
  }));
  if (!response.data?.success || !response.data?.video) {
    throw new Error(response.data?.error || 'Video processing failed');
  }
  await clearUploadState();
  onProgress?.(100);
  return { videoUrl: response.data.video, thumbnailUrl: response.data.thumbnailUrl };
}
