// Live room me kisi ko VOICE par gali dete suna? Ye report server ko jaati hai.
// Alag-alag 3 log (host ka report 2 ginta hai) 10 minute ke andar report karein to
// us user par 3 din ke liye live entry + live chalana apne aap band ho jata hai.
import { Alert } from "react-native";
import { callApi } from "./api";

export async function reportVoiceAbuse(roomId, targetUid) {
  try {
    const r = await callApi("/moderation/voice-report", { roomId, targetUid });
    if (r && r.banned) {
      Alert.alert("Action liya gaya", "Is user par 3 din ke liye live ban laga diya gaya hai.");
    } else {
      Alert.alert("Report mil gayi", "Dhanyavaad. Jaise hi kuch aur log bhi report karenge, user par action liya jayega.");
    }
  } catch (e) {
    Alert.alert("Report", (e && e.message) || "Report nahi bhej paye. Dobara try karo.");
  }
}
