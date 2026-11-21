// utils/liveSocket.js
// =====================================================================
// LIVE REALTIME client (likes + viewer count). Server: backend/liveSocket.js
//
// Zaroori: npm i socket.io-client   (pure JS hai, naya APK build nahi chahiye sirf Metro bundle)
//
// Use:
//   const rt = createLiveSocket({ roomId, isHost, onLike: (n) => ..., onViewers: (n) => ..., onStatus: (up) => ... });
//   rt.sendLike(n)      -> true agar socket se gaya; false => caller Firestore fallback kare
//   rt.isConnected()
//   rt.close()
//
// Socket na lage (server so raha / net kharab) to onStatus(false) rehta hai aur app purane
// Firestore raste par chalti hai. Judte hi onStatus(true) aur socket ka raasta shuru.
// =====================================================================
import { io } from 'socket.io-client';
import { API_BASE } from './api';

export function createLiveSocket({ roomId, isHost = false, onLike, onViewers, onStatus }) {
  let socket = null;
  let closed = false;
  let up = false;

  const setUp = (v) => {
    if (up === v) return;
    up = v;
    try { onStatus && onStatus(v); } catch (_) {}
  };

  try {
    const { auth } = require('../app/firebaseConfig');

    socket = io(API_BASE, {
      path: '/rt',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
      // har (re)connect par taaza Firebase token
      auth: (cb) => {
        const u = auth && auth.currentUser;
        if (!u) return cb({});
        u.getIdToken().then((t) => cb({ token: t })).catch(() => cb({}));
      },
    });

    socket.on('connect', () => {
      // reconnect par bhi dobara room join
      socket.emit('join', { roomId, host: !!isHost }, (ack) => {
        if (closed) return;
        if (ack && ack.ok) {
          setUp(true);
          if (typeof ack.viewers === 'number') {
            try { onViewers && onViewers(ack.viewers); } catch (_) {}
          }
        } else {
          setUp(false);
        }
      });
    });

    socket.on('disconnect', () => setUp(false));
    socket.on('connect_error', () => setUp(false));

    socket.on('like', (m) => {
      const n = Math.floor(Number(m && m.n));
      if (n > 0) {
        try { onLike && onLike(n); } catch (_) {}
      }
    });

    socket.on('viewers', (m) => {
      const n = Math.floor(Number(m && m.n));
      if (n >= 0) {
        try { onViewers && onViewers(n); } catch (_) {}
      }
    });
  } catch (_) {
    socket = null;
  }

  return {
    isConnected: () => !!(socket && socket.connected && up),
    sendLike: (n) => {
      if (!(socket && socket.connected && up)) return false;
      const c = Math.max(1, Math.min(30, Math.floor(Number(n) || 1)));
      socket.volatile.emit('like', { roomId, n: c });
      return true;
    },
    close: () => {
      closed = true;
      try {
        if (socket) {
          if (socket.connected) socket.emit('leave', { roomId });
          socket.removeAllListeners();
          socket.close();
        }
      } catch (_) {}
      socket = null;
      up = false;
    },
  };
}
