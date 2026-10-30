// Android <application> me android:largeHeap="true" set karta hai.
// Agar aapke project me plugins/withLargeHeap.js pehle se hai to ye file mat badlo.
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$["android:largeHeap"] = "true";
    return cfg;
  });
};
