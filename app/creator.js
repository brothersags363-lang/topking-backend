import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  BackHandler,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Blink / face check (npm i @react-native-ml-kit/face-detection, dev build chahiye)
let FaceDetection = null;
try {
  FaceDetection = require("@react-native-ml-kit/face-detection").default;
} catch (e) {
  FaceDetection = null;
}

import { auth, db, storage } from "./firebaseConfig";

/*
  Firestore: users/{uid}
    faceStatus     : "none" | "submitted" | "approved" | "rejected"
    faceSelfie     : download URL (admin review ke liye)
    quizPassed     : boolean
    quizScore      : number
    verified       : boolean                    (admin / backend set karta hai)
    verifiedColor  : "white" | "yellow" | "blue" (admin / backend set karta hai)

  Videos: all_videos  (userId == uid, views)  -> live count yahin se hota hai
*/

const YELLOW = "#FFE600";
const GOLD = "#D4AF37";
const PASS_SCORE = 60;
const QUIZ_SECONDS = 600;

const QUESTIONS = [
  {
    q: "Which type of video cover will have an adverse impact on your video exposure?",
    options: ["Cover that causes discomfort", "Pornographic emojis or text", "All above"],
    answer: 2,
  },
  {
    q: "For followers' feedback in the video comments, you should",
    options: [
      "Get to know the feedback and make adjustments",
      "Ignore the feedback",
    ],
    answer: 0,
  },
  {
    q: "Which video content is allowed on TopKing?",
    options: ["Original & safe content", "Copied / reposted videos", "Abusive content"],
    answer: 0,
  },
  {
    q: "What helps your video get more views?",
    options: ["Clear cover & good quality", "Blurry, low quality video"],
    answer: 0,
  },
  {
    q: "If you see a rule-breaking video, you should",
    options: ["Report it", "Share it more"],
    answer: 0,
  },
];

export default function Creator() {
  const router = useRouter();
  const footerStyle = useFooterStyle();
  const uid = auth?.currentUser?.uid;

  const [screen, setScreen] = useState("home"); // home | quiz | result | face
  const [data, setData] = useState(null);
  const [stats, setStats] = useState({ totalViews: 0, videosWith300: 0 });

  // ---------- live user data ----------
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) =>
      setData(snap.exists() ? snap.data() : {})
    );
    return unsub;
  }, [uid]);

  // ---------- live video stats (all_videos) ----------
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, "all_videos"), where("userId", "==", uid)),
      (snap) => {
        let total = 0;
        let ok300 = 0;
        snap.docs.forEach((d) => {
          const v = Number(d.data().views || 0);
          total += v;
          if (v >= 300) ok300 += 1;
        });
        setStats({ totalViews: total, videosWith300: ok300 });
      },
      () => {}
    );
    return unsub;
  }, [uid]);

  // ---------- hardware back ----------
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen !== "home") setScreen("home");
      else router.back();
      return true;
    });
    return () => sub.remove();
  }, [screen, router]);

  if (!data) {
    return (
      <SafeAreaView style={[s.safe, { justifyContent: "center" }]}>
        <ActivityIndicator color={YELLOW} size="large" />
      </SafeAreaView>
    );
  }

  const faceDone = data.faceStatus === "submitted" || data.faceStatus === "approved";
  const quizDone = !!data.quizPassed;
  const videosWith300 = stats.videosWith300;
  const totalViews = stats.totalViews;
  // real photo + bio profile me lagayi hai? (default icon nahi hona chahiye)
  const profileDone =
    !!data.profileImg &&
    !String(data.profileImg).includes("3135715") &&
    !!String(data.bioText || "").trim();
  const goEditProfile = () =>
    router.push({ pathname: "/(tabs)/profile", params: { edit: "1" } });
  const yellowEligible =
    faceDone && profileDone && quizDone && videosWith300 >= 5 && totalViews >= 4500;
  // Asli tick sirf wahi jo admin/backend ne users/{uid} me set kiya hai
  const tick = !data.verified
    ? "none"
    : data.verifiedColor === "blue"
    ? "blue"
    : data.verifiedColor === "yellow"
    ? "yellow"
    : "white";

  if (screen === "face")
    return <FaceScreen uid={uid} onBack={() => setScreen("home")} />;
  if (screen === "quiz")
    return (
      <QuizScreen
        uid={uid}
        onBack={() => setScreen("home")}
        onFinish={() => setScreen("result")}
      />
    );
  if (screen === "result")
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={s.hex}>
            <Text style={s.hexLabel}>SCORE</Text>
            <Text style={s.hexScore}>{data.quizScore ?? 0}</Text>
          </View>
          <Text style={s.bigYellow}>
            {data.quizPassed ? "Congratulations" : "Try again"}
          </Text>
          <Text style={s.grey}>
            {data.quizPassed ? "You won the challenge" : `Pass score is ${PASS_SCORE}`}
          </Text>
          <TouchableOpacity style={[s.btn, { width: "70%" }]} onPress={() => setScreen("home")}>
            <Text style={s.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

  // ---------- main button logic ----------
  let btnLabel = "Participate to get verified";
  let btnAction = () => setScreen("face");
  if (!faceDone) {
    btnLabel = "Step 1: Verify your face";
    btnAction = () => setScreen("face");
  } else if (!profileDone) {
    btnLabel = "Step 2: Add real photo & bio";
    btnAction = goEditProfile;
  } else if (!quizDone) {
    btnLabel = "Step 3: Start Quiz";
    btnAction = () => setScreen("quiz");
  } else {
    btnLabel =
      tick === "blue"
        ? "You are Blue Verified 🎉"
        : tick === "yellow"
        ? "You are Yellow Verified 🎉"
        : yellowEligible
        ? "Eligible! Waiting for TopKing approval"
        : "Complete videos & views";
    btnAction = () => {
      if (tick === "none" || tick === "white") router.push("/camera");
    };
  }

  const locked = !faceDone; // face verify ke bina sab locked

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 190 }} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>

        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>TOPKING</Text>
            <Text style={s.bigYellow2}>Creator{"\n"}Verification</Text>
            <Text style={s.grey}>Verification gives you privileges and more traffic</Text>
          </View>
          <MaterialIcons
            name="verified"
            size={110}
            color={tick === "blue" ? "#1E90FF" : tick === "yellow" ? YELLOW : tick === "white" ? "#fff" : "#555"}
          />
        </View>

        {/* Steps checklist */}
        <Text style={s.section}>Your Steps</Text>
        <Step
          n="1"
          title="Face verification"
          done={faceDone}
          onPress={faceDone ? undefined : () => setScreen("face")}
        />
        <Step
          n="2"
          title="Real face photo & bio in profile"
          done={profileDone}
          lock={!faceDone}
          onPress={faceDone && !profileDone ? goEditProfile : undefined}
        />
        <Step n="3" title="Quiz (score 60+)" done={quizDone} lock={!faceDone} />
        <Step
          n="4"
          title={`5 videos with 300+ views  (${Math.min(videosWith300, 5)}/5)`}
          done={videosWith300 >= 5}
          lock={locked}
          onPress={faceDone ? () => router.push("/camera") : undefined}
        />
        <Step
          n="5"
          title={`4500+ total views  (${totalViews}/4500)`}
          done={totalViews >= 4500}
          lock={locked}
        />

        {/* Privileges timeline */}
        <Text style={s.section}>Privileges</Text>

        <Level
          icon={<Ionicons name="person-circle" size={30} color="#bbb" />}
          label="Verified User"
          title="Unlock more video views"
          unlocked={faceDone && quizDone}
          lock={locked}
        />

        <Level
          icon={<MaterialIcons name="verified" size={30} color={YELLOW} />}
          label="Yellow Tick"
          title="5 videos + 4500 views • Family Creator, priority reports (24h), more visibility, higher earning"
          unlocked={tick === "yellow" || tick === "blue"}
          lock={locked}
        />

        <Level
          icon={<MaterialIcons name="verified" size={30} color="#1E90FF" />}
          label="Blue Tick"
          title="Full TopKing support, events & creator programs, monthly salary opportunities, premium creator account"
          unlocked={tick === "blue"}
          lock={locked}
          note="Blue Tick TopKing team approve karti hai"
        />
      </ScrollView>

      <View style={footerStyle}>
        <TouchableOpacity style={s.btn} onPress={btnAction}>
          <Text style={s.btnText}>{btnLabel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- small components ---------------- */

// navigation bar ke upar button rakhne ke liye
function useFooterStyle() {
  const insets = useSafeAreaInsets();
  return [s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 28 }];
}

function Step({ n, title, done, lock, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={[s.stepRow, lock && { opacity: 0.4 }]}
      {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}
    >
      <View style={[s.stepNo, done && { backgroundColor: YELLOW }]}>
        {done ? (
          <Ionicons name="checkmark" size={18} color="#000" />
        ) : lock ? (
          <Ionicons name="lock-closed" size={14} color={YELLOW} />
        ) : (
          <Text style={{ color: YELLOW, fontWeight: "bold" }}>{n}</Text>
        )}
      </View>
      <Text style={s.stepText}>{title}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color="#888" /> : null}
    </Wrap>
  );
}

function Level({ icon, label, title, unlocked, lock, note }) {
  return (
    <View style={[s.level, lock && { opacity: 0.45 }, unlocked && { borderColor: YELLOW }]}>
      <View style={{ width: 40, alignItems: "center" }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.levelLabel}>
          {label} {unlocked ? "✅" : lock ? "🔒" : ""}
        </Text>
        <Text style={s.levelTitle}>{title}</Text>
        {note ? <Text style={s.levelNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

/* ---------------- FACE SCREEN (liveness: look straight + blink) ---------------- */

const CAM = 230;
const RING = 280;
const DOTS = 56;

function DotRing({ progress }) {
  const r = RING / 2 - 6;
  return (
    <View style={{ position: "absolute", width: RING, height: RING }} pointerEvents="none">
      {Array.from({ length: DOTS }).map((_, i) => {
        const a = (i / DOTS) * 2 * Math.PI - Math.PI / 2;
        const on = i / DOTS < progress;
        const d = on ? 9 : 5;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              width: d,
              height: d,
              borderRadius: d / 2,
              left: RING / 2 + r * Math.cos(a) - d / 2,
              top: RING / 2 + r * Math.sin(a) - d / 2,
              backgroundColor: on ? YELLOW : "#6b6400",
            }}
          />
        );
      })}
    </View>
  );
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function FaceScreen({ uid, onBack }) {
  const footerStyle = useFooterStyle();
  const [perm, requestPerm] = useCameraPermissions();
  const [phase, setPhase] = useState("intro"); // intro | scan | done | fail
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("Look straight");
  const [hint, setHint] = useState("Please look straight at the camera");
  const [failMsg, setFailMsg] = useState("");
  const [stepNo, setStepNo] = useState(1);
  const cam = useRef(null);
  const alive = useRef(false);
  const camReady = useRef(false);
  const errRef = useRef("");
  const statRef = useRef({ shots: 0, faces: 0 });

  useEffect(() => () => { alive.current = false; }, []);

  const start = async () => {
    if (!FaceDetection) {
      return Alert.alert(
        "Face module install nahi hai",
        "npm i @react-native-ml-kit/face-detection  chalao aur app dobara build karo."
      );
    }
    if (!perm?.granted) {
      const r = await requestPerm();
      if (!r.granted) return Alert.alert("Camera permission chahiye");
    }
    camReady.current = false;
    errRef.current = "";
    statRef.current = { shots: 0, faces: 0 };
    setStepNo(1);
    setProgress(0.05);
    setTitle("Look straight");
    setHint("Seedha camera ki taraf dekho");
    setPhase("scan");
  };

  const fail = (msg) => {
    alive.current = false;
    setFailMsg(msg);
    setPhase("fail");
  };

  const finish = async (uri) => {
    setTitle("Verifying...");
    setHint("Please wait");
    let url = null;
    try {
      if (!uri) throw new Error("selfie nahi mili");
      const blob = await (await fetch(uri)).blob();
      const r = ref(storage, `faceVerify/${uid}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      url = await getDownloadURL(r);
    } catch (e) {
      // selfie upload fail ho (jaise Storage rules) to bhi verification na ruke
      console.log("FACE UPLOAD ERROR =", e);
      errRef.current = "upload: " + (e?.code || e?.message || String(e));
    }
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          faceStatus: "submitted",
          faceSelfie: url,
          faceLiveness: true,
          faceVerifiedAt: Date.now(),
        },
        { merge: true }
      );
      alive.current = false;
      setProgress(1);
      setPhase("done");
    } catch (e) {
      console.log("FACE SAVE ERROR =", e);
      fail("Save nahi hua: " + (e?.code || e?.message || String(e)));
    }
  };

  // 5 steps: seedha -> upar -> neeche -> right -> left
  const STEPS = [
    { title: "Look straight", hint: "Seedha camera ki taraf dekho" },
    { title: "Look up", hint: "Chehra thoda upar karo" },
    { title: "Look down", hint: "Chehra thoda neeche karo" },
    { title: "Turn right", hint: "Chehra thoda right taraf ghumao" },
    { title: "Turn left", hint: "Ab chehra left taraf ghumao" },
  ];

  const goStep = (i) => {
    setStepNo(i + 1);
    setProgress(Math.max(0.05, i / STEPS.length));
    setTitle(STEPS[i].title);
    setHint(STEPS[i].hint);
  };

  const runLiveness = async () => {
    const t0 = Date.now();
    let step = 0;
    let okCount = 0;
    let frontUri = null;
    let upSign = 0; // up/down ka sign yaad rakhte hain (phone ke hisab se ulta bhi ho sakta hai)
    let rightSign = 0;
    const PITCH = 12; // upar/neeche kitne degree
    const YAW = 18; // left/right kitne degree

    goStep(0);
    for (let i = 0; i < 50 && !camReady.current && alive.current; i++) await wait(100);
    await wait(500);

    while (alive.current) {
      if (Date.now() - t0 > 60000) {
        const st = statRef.current;
        return fail(
          `Time out. (photos: ${st.shots}, face mila: ${st.faces}` +
            (errRef.current ? `, error: ${errRef.current}` : "") +
            ")"
        );
      }

      let face = null;
      let uri = null;
      try {
        const pic = await cam.current?.takePictureAsync({ quality: 0.3, shutterSound: false });
        if (!alive.current) return;
        uri = pic?.uri || null;
        if (uri) statRef.current.shots += 1;
        if (uri) {
          const faces = await FaceDetection.detect(uri, {
            landmarkMode: "none",
            contourMode: "none",
            classificationMode: "none",
            performanceMode: "fast",
          });
          if (faces?.length > 1) {
            setHint("Camera me sirf ek chehra hona chahiye");
            await wait(150);
            continue;
          }
          face = faces?.[0] || null;
          if (face) statRef.current.faces += 1;
        }
      } catch (e) {
        face = null;
        errRef.current = e?.message || String(e);
      }
      if (!alive.current) return;

      if (!face) {
        okCount = 0;
        setHint("Face nahi mila - camera ki taraf dekho");
        await wait(150);
        continue;
      }

      const x = face.rotationX || 0; // pitch (upar/neeche)
      const y = face.rotationY || 0; // yaw (left/right)
      const z = face.rotationZ || 0; // tilt

      let passed = false;

      if (step === 0) {
        // seedha: dono angle chhote
        if (Math.abs(x) < 10 && Math.abs(y) < 10 && Math.abs(z) < 12) {
          okCount += 1;
          if (okCount >= 2) passed = true;
        } else {
          okCount = 0;
          setHint("Seedha camera ki taraf dekho");
        }
      } else if (step === 1) {
        if (Math.abs(x) >= PITCH && Math.abs(y) < 25) {
          upSign = Math.sign(x);
          passed = true;
        }
      } else if (step === 2) {
        if (Math.abs(x) >= PITCH && Math.sign(x) === -upSign && Math.abs(y) < 25) passed = true;
      } else if (step === 3) {
        if (Math.abs(y) >= YAW && Math.abs(x) < 25) {
          rightSign = Math.sign(y);
          passed = true;
        }
      } else if (step === 4) {
        if (Math.abs(y) >= YAW && Math.sign(y) === -rightSign && Math.abs(x) < 25) passed = true;
      }

      if (passed) {
        if (step === 0) {
          // final selfie yahin lete hain (seedha chehra)
          try {
            const best = await cam.current?.takePictureAsync({ quality: 0.6, shutterSound: false });
            frontUri = best?.uri || uri;
          } catch (e) {
            frontUri = uri;
          }
        }
        okCount = 0;
        step += 1;
        if (step >= STEPS.length) {
          setProgress(0.95);
          return finish(frontUri);
        }
        goStep(step);
        await wait(350); // pose badalne ka time
        continue;
      }
      await wait(100);
    }
  };

  useEffect(() => {
    if (phase !== "scan") return;
    alive.current = true;
    runLiveness();
    return () => { alive.current = false; };
  }, [phase]);

  /* ---- scan / done / fail: circle + ring ---- */
  if (phase !== "intro") {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onBack}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Facial recognition</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={{ alignItems: "center", marginTop: 20 }}>
          <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
            <DotRing progress={progress} />
            <View style={s.camCircle}>
              {phase === "scan" ? (
                <CameraView
                  ref={cam}
                  style={{ flex: 1 }}
                  facing="front"
                  onCameraReady={() => { camReady.current = true; }}
                />
              ) : phase === "done" ? (
                <View style={s.camResult}>
                  <Ionicons name="checkmark-circle" size={110} color="#12d1a0" />
                </View>
              ) : (
                <View style={s.camResult}>
                  <Ionicons name="close-circle" size={110} color="#e8086a" />
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={{ alignItems: "center", marginTop: 28, paddingHorizontal: 20 }}>
          <View style={s.emoji}>
            <Ionicons
              name={phase === "done" ? "happy" : phase === "fail" ? "sad" : "happy-outline"}
              size={34}
              color="#000"
            />
          </View>
          {phase === "scan" && (
            <Text style={[s.grey, { marginBottom: 2 }]}>Step {stepNo} of 5</Text>
          )}
          <Text style={s.faceTitle}>
            {phase === "done" ? "Verification successful" : phase === "fail" ? "Verification failed" : title}
          </Text>
          <Text style={[s.grey, { textAlign: "center", marginTop: 8 }]}>
            {phase === "done"
              ? "Face verification complete. Ab apni real photo aur bio profile me lagao." +
                (errRef.current ? `\n(${errRef.current})` : "")
              : phase === "fail"
              ? failMsg
              : hint}
          </Text>
        </View>

        {phase === "done" && (
          <View style={footerStyle}>
            <TouchableOpacity style={s.btn} onPress={onBack}>
              <Text style={s.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}
        {phase === "fail" && (
          <View style={footerStyle}>
            <TouchableOpacity style={s.btn} onPress={() => setPhase("intro")}>
              <Text style={s.btnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  /* ---- intro ---- */
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Facial recognition</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={{ alignItems: "center", marginTop: 30 }}>
        <View style={s.faceCircle}>
          <Ionicons name="happy" size={90} color={YELLOW} />
        </View>
      </View>

      <Text style={[s.point, { margin: 16 }]}>
        Facial recognition is one of the steps for TopKing Verification.
      </Text>
      <Text style={[s.grey, { marginHorizontal: 16 }]}>
        After completing verification, you will be entitled to the following privileges:
      </Text>

      <View style={s.pill}>
        <MaterialIcons name="verified" size={22} color={YELLOW} />
        <Text style={s.pillText}>Exclusive badge</Text>
      </View>
      <View style={s.pill}>
        <Ionicons name="flame" size={22} color="#ff3d71" />
        <Text style={s.pillText}>Exclusive traffic allocation</Text>
      </View>

      <View style={footerStyle}>
        <TouchableOpacity style={s.btn} onPress={start}>
          <Text style={s.btnText}>Verify now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- QUIZ SCREEN ---------------- */

function QuizScreen({ uid, onBack, onFinish }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(QUIZ_SECONDS);
  const finished = useRef(false);

  const finish = async (finalScore) => {
    if (finished.current) return;
    finished.current = true;
    await setDoc(
      doc(db, "users", uid),
      { quizScore: finalScore, quizPassed: finalScore >= PASS_SCORE },
      { merge: true }
    );
    onFinish();
  };

  useEffect(() => {
    const t = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (left <= 0) finish(score);
  }, [left]);

  const q = QUESTIONS[idx];
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(Math.max(left % 60, 0)).padStart(2, "0");

  const pick = (i) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((v) => v + 20);
  };

  const next = () => {
    if (picked === null) return Alert.alert("Pehle ek option chuno");
    if (idx === QUESTIONS.length - 1) return finish(score);
    setIdx(idx + 1);
    setPicked(null);
  };

  return (
    <SafeAreaView style={s.safe}>
      <TouchableOpacity onPress={onBack} style={{ padding: 16 }}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>

      <Text style={s.qCount}>
        0{idx + 1}
        <Text style={{ fontSize: 14 }}>/0{QUESTIONS.length}</Text>
      </Text>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${((idx + 1) / QUESTIONS.length) * 100}%` }]} />
      </View>
      <Text style={s.grey2}>
        {picked === null ? "Choose the right answer" : picked === q.answer ? "Congratulations, you got it!" : "Come on, try next time!"}
      </Text>

      <Text style={s.question}>{q.q}</Text>

      {q.options.map((o, i) => {
        const right = picked !== null && i === q.answer;
        const wrong = picked === i && i !== q.answer;
        return (
          <TouchableOpacity
            key={i}
            activeOpacity={0.8}
            onPress={() => pick(i)}
            style={[s.opt, right && { backgroundColor: "#12d1a0" }, wrong && { backgroundColor: "#e8086a" }]}
          >
            <View style={s.optLetter}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={s.optText}>{o}</Text>
            {right && <Ionicons name="checkmark" size={22} color="#fff" />}
            {wrong && <Ionicons name="close" size={22} color="#fff" />}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={[s.btn, { marginHorizontal: 16, marginTop: 20 }]} onPress={next}>
        <Text style={s.btnText}>{idx === QUESTIONS.length - 1 ? "Finish" : "Next"}</Text>
      </TouchableOpacity>

      <View style={s.quizFooter}>
        <Text style={s.grey}>Countdown: {mm}:{ss}</Text>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", paddingHorizontal: 20, alignItems: "center" },
  brand: { color: GOLD, fontSize: 30, fontWeight: "900", letterSpacing: 2 },
  bigYellow2: { color: YELLOW, fontSize: 26, fontWeight: "800", marginVertical: 6 },
  bigYellow: { color: YELLOW, fontSize: 26, fontWeight: "800", marginTop: 40 },
  grey: { color: "#999", fontSize: 14, marginTop: 4 },
  grey2: { color: "#999", fontSize: 14, marginHorizontal: 16, marginTop: 10 },
  section: { color: "#fff", fontSize: 18, fontWeight: "800", marginHorizontal: 20, marginTop: 28, marginBottom: 12 },

  stepRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 12 },
  stepNo: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: YELLOW, alignItems: "center", justifyContent: "center", marginRight: 12 },
  stepText: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },

  level: { flexDirection: "row", backgroundColor: "#1e1e1e", marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#2a2a2a" },
  levelLabel: { color: "#aaa", fontSize: 13 },
  levelTitle: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 4, lineHeight: 20 },
  levelNote: { color: YELLOW, fontSize: 12, marginTop: 6 },

  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#111" },
  btn: { backgroundColor: YELLOW, borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#000", fontWeight: "800", fontSize: 16 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  topTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  faceCircle: { width: 150, height: 150, borderRadius: 75, borderWidth: 4, borderColor: YELLOW, alignItems: "center", justifyContent: "center" },
  point: { color: "#fff", fontSize: 16, fontWeight: "600", lineHeight: 24 },
  pill: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e1e", marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 12 },
  pillText: { color: "#fff", marginLeft: 12, fontWeight: "600" },

  camCircle: { width: CAM, height: CAM, borderRadius: CAM / 2, overflow: "hidden", backgroundColor: "#000" },
  camResult: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" },
  emoji: { width: 56, height: 56, borderRadius: 28, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center" },
  faceTitle: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 14 },

  hex: { width: 190, height: 190, borderRadius: 40, backgroundColor: "#222", borderWidth: 4, borderColor: "#444", alignItems: "center", justifyContent: "center" },
  hexLabel: { color: "#aaa", fontSize: 12 },
  hexScore: { color: YELLOW, fontSize: 80, fontWeight: "900" },

  qCount: { color: YELLOW, fontSize: 26, fontWeight: "900", fontStyle: "italic", marginHorizontal: 16 },
  barBg: { height: 5, backgroundColor: "#333", marginHorizontal: 16, borderRadius: 3, marginTop: 8 },
  barFill: { height: 5, backgroundColor: YELLOW, borderRadius: 3 },
  question: { color: YELLOW, fontSize: 22, fontWeight: "800", margin: 16, marginTop: 28, lineHeight: 30 },
  opt: { flexDirection: "row", alignItems: "center", backgroundColor: "#2a2a2a", marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: 12 },
  optLetter: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#555", alignItems: "center", justifyContent: "center", marginRight: 12 },
  optText: { color: "#fff", fontSize: 15, fontWeight: "600", flex: 1 },
  quizFooter: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, borderTopWidth: 1, borderTopColor: "#222" },
});
