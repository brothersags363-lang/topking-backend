// Saved reel drafts (Post screen -> "Drafts"). Tap = open Post again,
// trash = delete. Thumbnails are made once per draft, lazily.
import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Alert, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from '../utils/safeRouter';
import { listDrafts, deleteDraft } from '../utils/reelDrafts';

const COLS = 3;
const GAP = 2;
const W = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

const DraftCell = memo(function DraftCell({ item, onOpen, onDelete }: any) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    VideoThumbnails.getThumbnailAsync(item.params.videoUri, { time: 300, quality: 0.4 })
      .then((r) => alive && setThumb(r.uri))
      .catch(() => {});
    return () => { alive = false; };
  }, [item.params.videoUri]);

  return (
    <TouchableOpacity style={styles.cell} activeOpacity={0.85} onPress={() => onOpen(item)}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.cellShade} />
      <Text style={styles.cellCaption} numberOfLines={2}>{item.caption || 'Draft'}</Text>
      <TouchableOpacity style={styles.trash} hitSlop={8} onPress={() => onDelete(item)}>
        <Ionicons name="trash-outline" size={16} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function DraftsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [drafts, setDrafts] = useState<any[]>([]);

  useEffect(() => {
    if (focused) listDrafts().then(setDrafts).catch(() => {});
  }, [focused]);

  const onOpen = useCallback((d: any) => {
    router.push({ pathname: '/post', params: { ...d.params, draftId: d.id, draftCaption: d.caption || '' } });
  }, [router]);

  const onDelete = useCallback((d: any) => {
    Alert.alert('Delete draft?', 'Ye draft hamesha ke liye hat jayega.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDraft(d.id);
          setDrafts((list) => list.filter((x) => x.id !== d.id));
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Drafts</Text>
        <View style={styles.back} />
      </View>
      <FlatList
        data={drafts}
        keyExtractor={(d) => d.id}
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + 20 }}
        renderItem={({ item }) => <DraftCell item={item} onOpen={onOpen} onDelete={onDelete} />}
        ListEmptyComponent={<Text style={styles.empty}>Koi draft nahi hai.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cell: { width: W, height: W * 1.6, backgroundColor: '#222', justifyContent: 'flex-end' },
  cellShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  cellCaption: { color: '#fff', fontSize: 11, padding: 6 },
  trash: {
    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  empty: { color: '#777', textAlign: 'center', marginTop: 60 },
});
