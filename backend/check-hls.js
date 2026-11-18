const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./serviceAccountKey.json")) });
admin.firestore().collection("all_videos").orderBy("createdAt", "desc").limit(3).get().then((s) => {
  s.forEach((d) => {
    const x = d.data();
    console.log(d.id, "| hlsReady:", x.hlsReady, "| streamUid:", x.streamUid, "\n  hlsUrl:", x.hlsUrl, "\n  videoUrl:", x.videoUrl);
  });
  process.exit(0);
});
