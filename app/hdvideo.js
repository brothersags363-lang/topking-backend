import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  Alert,
  BackHandler,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const VIDEO_QUALITIES = [
  {
    id: "auto",
    title: "Auto",
    description: "Automatically adjust video quality",
    icon: "sparkles-outline",
  },
  {
    id: "144p",
    title: "144p",
    description: "Lowest quality • Saves the most data",
    icon: "cellular-outline",
  },
  {
    id: "240p",
    title: "240p",
    description: "Low quality • Very low data usage",
    icon: "cellular-outline",
  },
  {
    id: "360p",
    title: "360p",
    description: "Standard quality • Low data usage",
    icon: "phone-portrait-outline",
  },
  {
    id: "480p",
    title: "480p",
    description: "Good quality • Moderate data usage",
    icon: "phone-portrait-outline",
  },
  {
    id: "720p",
    title: "720p HD",
    description: "HD quality • Higher data usage",
    icon: "tv-outline",
  },
  {
    id: "1080p",
    title: "1080p Full HD",
    description: "Best quality • Uses more data",
    icon: "desktop-outline",
  },
];

export default function VideoQualityScreen() {
  const router = useRouter();

  const [selectedQuality, setSelectedQuality] =
    useState("auto");

  const [saving, setSaving] = useState(false);


useEffect(() => {

  const onBackPress = () => {

    if (router.canGoBack()) {
      router.back();
      return true;
    }

    return false;
  };


  const subscription =
    BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );


  return () => {
    subscription.remove();
  };

}, [router]);
  

  // Saved quality load karo
  useEffect(() => {
    loadVideoQuality();
  }, []);

  const loadVideoQuality = async () => {
    try {
      const savedQuality =
        await AsyncStorage.getItem("videoQuality");

      if (savedQuality) {
        setSelectedQuality(savedQuality);
      }
    } catch (error) {
      console.log(
        "VIDEO QUALITY LOAD ERROR =",
        error
      );
    }
  };

  // Quality select
  const selectQuality = (qualityId) => {
    setSelectedQuality(qualityId);
  };

  // Quality save
  const saveVideoQuality = async () => {
    try {
      setSaving(true);

      await AsyncStorage.setItem(
        "videoQuality",
        selectedQuality
      );

      const selectedItem =
        VIDEO_QUALITIES.find(
          (item) => item.id === selectedQuality
        );

      Alert.alert(
        "Video Quality Updated",
        `${selectedItem?.title || selectedQuality} selected successfully.`,
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.log(
        "VIDEO QUALITY SAVE ERROR =",
        error
      );

      Alert.alert(
        "Error",
        "Video quality save nahi ho saki."
      );
    } finally {
      setSaving(false);
    }
  };

  const renderQuality = ({ item }) => {
    const isSelected =
      selectedQuality === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() =>
          selectQuality(item.id)
        }
        style={[
          styles.qualityItem,
          isSelected &&
            styles.selectedQualityItem,
        ]}
      >
        {/* Left */}
        <View style={styles.qualityLeft}>
          <View
            style={[
              styles.qualityIconBox,
              isSelected &&
                styles.selectedQualityIconBox,
            ]}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={
                isSelected
                  ? "#000"
                  : "#FFD700"
              }
            />
          </View>

          <View style={styles.textContainer}>
            <Text
              style={[
                styles.qualityTitle,
                isSelected &&
                  styles.selectedQualityTitle,
              ]}
            >
              {item.title}
            </Text>

            <Text style={styles.qualityDescription}>
              {item.description}
            </Text>
          </View>
        </View>

        {/* Radio */}
        <View
          style={[
            styles.radio,
            isSelected &&
              styles.radioSelected,
          ]}
        >
          {isSelected && (
            <Ionicons
              name="checkmark"
              size={16}
              color="#000"
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#000"
        barStyle="light-content"
      />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Video Quality
        </Text>

        <View style={{ width: 40 }} />
      </View>

      {/* INFO */}
      <View style={styles.infoBox}>
        <Ionicons
          name="videocam-outline"
          size={23}
          color="#FFD700"
        />

        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>
            Choose Video Quality
          </Text>

          <Text style={styles.infoText}>
            Higher quality gives you a clearer
            video but uses more mobile data.
          </Text>
        </View>
      </View>

      {/* QUALITY LIST */}
      <FlatList
        data={VIDEO_QUALITIES}
        keyExtractor={(item) => item.id}
        renderItem={renderQuality}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 15,
          paddingBottom: 120,
        }}
      />

      {/* SAVE BUTTON */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={saving}
          onPress={saveVideoQuality}
          style={[
            styles.saveButton,
            saving &&
              styles.disabledButton,
          ]}
        >
          {saving ? (
            <Text style={styles.saveButtonText}>
              Saving...
            </Text>
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={21}
                color="#000"
              />

              <Text style={styles.saveButtonText}>
                Save Quality
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  // HEADER
  header: {
    height: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },

  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "bold",
  },

  // INFO
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#151515",
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 10,
    padding: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#292929",
  },

  infoTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginLeft: 10,
    marginBottom: 3,
  },

  infoText: {
    color: "#888",
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },

  // QUALITY ITEM
  qualityItem: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#222",
  },

  selectedQualityItem: {
    backgroundColor: "#181500",
    borderColor: "#FFD700",
  },

  qualityLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  qualityIconBox: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#1d1d1d",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  selectedQualityIconBox: {
    backgroundColor: "#FFD700",
  },

  textContainer: {
    flex: 1,
  },

  qualityTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  selectedQualityTitle: {
    color: "#FFD700",
  },

  qualityDescription: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
    paddingRight: 8,
  },

  // RADIO
  radio: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  radioSelected: {
    backgroundColor: "#FFD700",
    borderColor: "#FFD700",
  },

  // BOTTOM
  bottomContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "#222",
  },

  saveButton: {
    height: 52,
    backgroundColor: "#FFD700",
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 7,
  },
});