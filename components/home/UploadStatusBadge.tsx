import { memo, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useUploadState } from '@/services/upload/uploadManager';
import { width } from './feedShared';
import { styles } from './feedStyles';

// ======================================================
// UploadStatusBadge — background reel-upload progress pill
// ======================================================
// FIX (performance): isse jaan-boojh kar ek alag, standalone
// component me rakha gaya hai jiska koi prop nahi hai. `useUploadState`
// hook ke andar ka `useState` isi component ke fiber se juda hota
// hai — matlab jab bhi upload % badle (jo network chunk ke hisaab se
// baar-baar ho sakta hai), sirf ye chhota badge re-render hota hai,
// bhaari `BottomNav` (poora reels FlatList wala parent) bilkul touch
// nahi hota. Isse feed scroll karte waqt kabhi lag/jhatka mehsoos
// nahi hoga.
export const UploadStatusBadge = memo(function UploadStatusBadge() {
  const uploadState = useUploadState();

  if (
    !uploadState.uploading &&
    !uploadState.justCompleted &&
    !uploadState.error &&
    !uploadState.retrying
  ) {
    return null;
  }

  return (
    <View style={styles.uploadBadge} pointerEvents="none">
      {uploadState.error ? (
        <Text style={styles.uploadBadgeErrorText} numberOfLines={1}>
          ⚠️ Upload failed
        </Text>
      ) : uploadState.retrying ? (
        <Text style={styles.uploadBadgeText} numberOfLines={1}>
          🔄 Retrying...
        </Text>
      ) : uploadState.justCompleted ? (
        <Text style={styles.uploadBadgeText}>✅ Posted</Text>
      ) : (
        <>
          <Text style={styles.uploadBadgeText}>{uploadState.progress}%</Text>
          <View style={styles.uploadBadgeTrack}>
            <View style={[styles.uploadBadgeFill, { width: `${uploadState.progress}%` }]} />
          </View>
        </>
      )}
    </View>
  );
});


