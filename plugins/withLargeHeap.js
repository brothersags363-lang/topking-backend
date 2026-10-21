// Android: Java heap limit (256MB) badhane ke liye largeHeap on.
// Play Console SIGABRT: "OutOfMemoryError ... growth limit 268435456" (MediaCodec).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:largeHeap'] = 'true';
    return cfg;
  });
};
