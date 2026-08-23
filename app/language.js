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

const LANGUAGES = [
  {
    id: "en",
    name: "English",
    nativeName: "English",
  },
  {
    id: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
  },
  {
    id: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
  },
  {
    id: "mr",
    name: "Marathi",
    nativeName: "मराठी",
  },
  {
    id: "gu",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
  },
  {
    id: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
  },
  {
    id: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
  },
  {
    id: "kn",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
  },
  {
    id: "ml",
    name: "Malayalam",
    nativeName: "മലയാളം",
  },
  {
    id: "pa",
    name: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
  },
  {
    id: "ur",
    name: "Urdu",
    nativeName: "اردو",
  },
];

export default function LanguageScreen() {
  const router = useRouter();

  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [saving, setSaving] = useState(false);

  // Previously selected language load karo
  useEffect(() => {
    loadLanguage();
  }, []);



// Mobile hardware back button
useEffect(() => {
  const handleBackPress = () => {
    router.back();
    return true;
  };

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    handleBackPress
  );

  return () => {
    subscription.remove();
  };
}, [router]);


  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(
        "selectedLanguage"
      );

      if (savedLanguage) {
        setSelectedLanguage(savedLanguage);
      }
    } catch (error) {
      console.log("LANGUAGE LOAD ERROR =", error);
    }
  };

  // Language select
  const selectLanguage = (languageId) => {
    setSelectedLanguage(languageId);
  };

  // Save language
  const saveLanguage = async () => {
    try {
      setSaving(true);

      await AsyncStorage.setItem(
        "selectedLanguage",
        selectedLanguage
      );

      const language = LANGUAGES.find(
        (item) => item.id === selectedLanguage
      );

      Alert.alert(
        "Language Updated",
        `${language?.name || "Language"} selected successfully.`,
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.log("LANGUAGE SAVE ERROR =", error);

      Alert.alert(
        "Error",
        "Language save nahi ho saki."
      );
    } finally {
      setSaving(false);
    }
  };

  const renderLanguage = ({ item }) => {
    const isSelected =
      selectedLanguage === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.languageItem,
          isSelected && styles.selectedLanguageItem,
        ]}
        onPress={() => selectLanguage(item.id)}
      >
        <View style={styles.languageLeft}>

          {/* Language Icon */}
          <View
            style={[
              styles.languageIcon,
              isSelected && styles.selectedLanguageIcon,
            ]}
          >
            <Ionicons
              name="language-outline"
              size={22}
              color={
                isSelected
                  ? "#000"
                  : "#FFD700"
              }
            />
          </View>

          {/* Language Name */}
          <View>
            <Text
              style={[
                styles.languageName,
                isSelected &&
                  styles.selectedLanguageName,
              ]}
            >
              {item.name}
            </Text>

            <Text style={styles.nativeName}>
              {item.nativeName}
            </Text>
          </View>

        </View>

        {/* Check Icon */}
        <View
          style={[
            styles.radio,
            isSelected && styles.radioSelected,
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

      {/* Header */}
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
          Language
        </Text>

        <View style={{ width: 40 }} />

      </View>

      {/* Description */}
      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={22}
          color="#FFD700"
        />

        <Text style={styles.infoText}>
          Select your preferred language. Your
          selection will be saved automatically.
        </Text>
      </View>

      {/* Language List */}
      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.id}
        renderItem={renderLanguage}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 15,
          paddingBottom: 120,
        }}
      />

      {/* Save Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.disabledButton,
          ]}
          onPress={saveLanguage}
          disabled={saving}
          activeOpacity={0.8}
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
                Save Language
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

  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#151515",
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#292929",
  },

  infoText: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 10,
    flex: 1,
  },

  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#222",
  },

  selectedLanguageItem: {
    backgroundColor: "#181500",
    borderColor: "#FFD700",
  },

  languageLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  languageIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1d1d1d",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  selectedLanguageIcon: {
    backgroundColor: "#FFD700",
  },

  languageName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  selectedLanguageName: {
    color: "#FFD700",
  },

  nativeName: {
    color: "#777",
    fontSize: 13,
    marginTop: 3,
  },

  radio: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  },

  radioSelected: {
    backgroundColor: "#FFD700",
    borderColor: "#FFD700",
  },

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