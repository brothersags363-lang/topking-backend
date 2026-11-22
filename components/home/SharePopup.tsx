import { View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, Share } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { styles } from './feedStyles';

export function SharePopup({ SHARE_APPS, copyVideoLink, onSharePick, router, selectedShareVideo, setShowSharePopup }: any) {
  return (

<View style={styles.sharePopupContainer}>

  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setShowSharePopup(false)}
  />

  <View style={styles.sharePopup}>

    {/* Header */}
    <View style={styles.shareHeader}>
      <Text style={styles.shareTitle}>Share to</Text>
      <TouchableOpacity onPress={() => setShowSharePopup(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="chevron-down" size={24} color="#fff" />
      </TouchableOpacity>
    </View>

    {/* Row 1: apps */}
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shareAppsRow}
      keyboardShouldPersistTaps="handled"
    >
      {SHARE_APPS.map((a) => (
        <TouchableOpacity
          key={a.key}
          style={styles.shareItem}
          activeOpacity={0.7}
          onPress={() => onSharePick(a.key)}
        >
          <View style={[styles.shareCircle, { backgroundColor: a.bg }]}>
            {a.lib === 'ion'
              ? <Ionicons name={a.icon} size={28} color={a.color} />
              : <MaterialCommunityIcons name={a.icon} size={28} color={a.color} />}
          </View>
          <Text style={styles.shareItemText} numberOfLines={2}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>

    {/* Row 2: actions */}
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shareAppsRow}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.shareItem}
        activeOpacity={0.7}
        onPress={() => {
          setShowSharePopup(false);
          // Save Video Logic
        }}
      >
        <View style={styles.shareCircleDark}>
          <Ionicons name="download" size={24} color="#fff" />
        </View>
        <Text style={styles.shareItemText}>Save</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.shareItem}
        activeOpacity={0.7}
        onPress={() => {
          const id = selectedShareVideo?.id;
          setShowSharePopup(false);
          if (id) copyVideoLink(id);
        }}
      >
        <View style={styles.shareCircleDark}>
          <Ionicons name="link" size={24} color="#fff" />
        </View>
        <Text style={styles.shareItemText}>Copy link</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.shareItem}
        activeOpacity={0.7}
        onPress={() => {
          setShowSharePopup(false);
          router.push({
            pathname: "/report",
            params: { videoId: selectedShareVideo?.id },
          });
        }}
      >
        <View style={styles.shareCircleDark}>
          <Ionicons name="warning" size={24} color="#fff" />
        </View>
        <Text style={styles.shareItemText}>Report</Text>
      </TouchableOpacity>
    </ScrollView>

  </View>

</View>

  );
}
