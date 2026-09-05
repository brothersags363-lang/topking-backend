[1mdiff --git a/app/LiveRoom.js b/app/LiveRoom.js[m
[1mindex 6c505d7..59de97b 100644[m
[1m--- a/app/LiveRoom.js[m
[1m+++ b/app/LiveRoom.js[m
[36m@@ -349,6 +349,8 @@[m [mconst [joined,setJoined]=useState(false);[m
 [m
 const [remoteUsers,setRemoteUsers]=useState([]);[m
 [m
[32m+[m[32mconst heartbeatRef = useRef(null);[m
[32m+[m
 const [mutedUsers,setMutedUsers]=useState([]);[m
 [m
 const [activeSpeakers, setActiveSpeakers] = useState({});[m
[36m@@ -1096,6 +1098,95 @@[m [mif ([m
 ]);[m
 [m
 [m
[32m+[m[32m// =====================================================[m
[32m+[m[32m// LIVE ROOM HEARTBEAT[m
[32m+[m[32m// =====================================================[m
[32m+[m
[32m+[m[32museEffect(() => {[m
[32m+[m
[32m+[m[32m  if (!db || !roomId || !currentUid) {[m
[32m+[m[32m    return;[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const roomRef = doc(db, "rooms", roomId);[m
[32m+[m
[32m+[m[32m  const sendHeartbeat = async () => {[m
[32m+[m
[32m+[m[32m    try {[m
[32m+[m
[32m+[m[32m      // Room exist karta hai ya nahi check[m
[32m+[m[32m      const roomSnap = await getDoc(roomRef);[m
[32m+[m
[32m+[m[32m      if (!roomSnap.exists()) {[m
[32m+[m[32m        console.log("Heartbeat: Room not found");[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      const data = roomSnap.data();[m
[32m+[m
[32m+[m[32m      // Sirf room ka host heartbeat bhejega[m
[32m+[m[32m      if (data?.hostId !== currentUid) {[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      await updateDoc(roomRef, {[m
[32m+[m
[32m+[m[32m        lastHeartbeat: Date.now(),[m
[32m+[m
[32m+[m[32m        hostOnline: true,[m
[32m+[m
[32m+[m[32m      });[m
[32m+[m
[32m+[m[32m      console.log([m
[32m+[m[32m        "❤️ Live heartbeat sent:",[m
[32m+[m[32m        roomId[m
[32m+[m[32m      );[m
[32m+[m
[32m+[m[32m    } catch (error) {[m
[32m+[m
[32m+[m[32m      console.log([m
[32m+[m[32m        "Heartbeat Error:",[m
[32m+[m[32m        error[m
[32m+[m[32m      );[m
[32m+[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m  };[m
[32m+[m
[32m+[m
[32m+[m[32m  // Page open hote hi ek baar heartbeat[m
[32m+[m[32m  sendHeartbeat();[m
[32m+[m
[32m+[m
[32m+[m[32m  // Har 15 second heartbeat[m
[32m+[m[32m  heartbeatRef.current = setInterval(() => {[m
[32m+[m
[32m+[m[32m    sendHeartbeat();[m
[32m+[m
[32m+[m[32m  }, 15000);[m
[32m+[m
[32m+[m
[32m+[m[32m  // Cleanup[m
[32m+[m[32m  return () => {[m
[32m+[m
[32m+[m[32m    if (heartbeatRef.current) {[m
[32m+[m
[32m+[m[32m      clearInterval([m
[32m+[m[32m        heartbeatRef.current[m
[32m+[m[32m      );[m
[32m+[m
[32m+[m[32m      heartbeatRef.current = null;[m
[32m+[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m  };[m
[32m+[m
[32m+[m[32m}, [[m
[32m+[m[32m  roomId,[m
[32m+[m[32m  currentUid[m
[32m+[m[32m]);[m
[32m+[m
[32m+[m
 [m
 [m
 useEffect(() => {[m
