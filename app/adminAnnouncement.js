import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import useIsAdmin from "./useIsAdmin";
import { callApi } from "../utils/api";
import { uploadImage } from "../utils/uploadImage";

// Admin: ghoshna likho (photo optional) -> sabhi users ko notification
export default function AdminAnnouncement() {
  const isAdmin = useIsAdmin();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Gallery ki permission do");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!r.canceled && r.assets && r.assets[0]) setPhoto(r.assets[0].uri);
    } catch (e) {
      Alert.alert("Error", "Photo nahi chuni ja saki");
    }
  };

  const send = () => {
    if (busy) return;
    if (!text.trim() && !photo) return Alert.alert("Ghoshna", "Kuch likho ya photo lagao");

    Alert.alert("Sabko bhejna hai?", "Ye ghoshna app ke SAARE users ko notification me jayegi.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setBusy(true);
          try {
            const imageUrl = photo ? await uploadImage(photo, "announcement") : "";
            await callApi("/admin/send-announcement", {
              title: title.trim(),
              text: text.trim(),
              imageUrl,
            });
            Alert.alert("Bhej di ✅", "Ghoshna sabhi users ko bheji ja rahi hai");
            setTitle("");
            setText("");
            setPhoto(null);
          } catch (e) {
            Alert.alert("Error", e.message || "Nahi bhej paye");
          }
          setBusy(false);
        },
      },
    ]);
  };

  if (!isAdmin) {
    return (
      <View style={s.center}>
        <Text style={{ color: "red", fontSize: 20 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#000" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Ghoshna (Announcement)</Text>
        <Text style={s.sub}>Likh ke ya photo ke saath bhejo - sabko notification jayega</Text>

        <Text style={s.label}>Heading (optional)</Text>
        <TextInput
          style={s.input}
          placeholder="Jaise: Naya Event Shuru!"
          placeholderTextColor="#777"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        <Text style={s.label}>Ghoshna likho</Text>
        <TextInput
          style={[s.input, { minHeight: 140, textAlignVertical: "top" }]}
          placeholder="Yahan apni ghoshna likho..."
          placeholderTextColor="#777"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <Text style={s.count}>{text.length}/2000</Text>

        <Text style={s.label}>Photo (optional)</Text>
        <TouchableOpacity style={s.photoBox} onPress={pickPhoto} activeOpacity={0.8}>
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <View style={{ alignItems: "center" }}>
              <Ionicons name="image" size={36} color="#8B5CF6" />
              <Text style={{ color: "#aaa", marginTop: 6 }}>Photo chuno</Text>
            </View>
          )}
        </TouchableOpacity>
        {photo && (
          <TouchableOpacity onPress={() => setPhoto(null)} style={{ alignSelf: "center", marginTop: 6 }}>
            <Text style={{ color: "#ff3b30", fontWeight: "bold" }}>Photo hatao</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.submit, busy && { opacity: 0.6 }]} onPress={send} disabled={busy} activeOpacity={0.85}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="megaphone" size={18} color="#fff" />
              <Text style={s.submitText}>Sabko Bhejo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", paddingHorizontal: 14, paddingTop: 12 },
  center: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold", textAlign: "center" },
  sub: { color: "#888", fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 6 },
  label: { color: "#FFD700", fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: "#15151a",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#26262d",
  },
  count: { color: "#666", fontSize: 11, textAlign: "right", marginTop: 4 },
  photoBox: {
    height: 220,
    backgroundColor: "#15151a",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  submit: {
    marginTop: 22,
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
