import React, { memo } from 'react';
import { Modal, View } from 'react-native';
import LevelFrame from '../LevelFrame';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { navBarGap } from './helpers';

// LIVE ROOM FRAME: sirf level se (LevelFrame.js ka rule): 30-39 -> lv30, 40-49 -> lv40, 50+ -> lv50.
// Admin ka diya frame uid se aata hai (map se, koi Firestore read nahi) aur level frame ko override karta hai.
// lookup={false} => koi Firestore read nahi (fast).
export const GuardedFrame = memo((props) => (
  <LevelFrame level={props.level} uid={props.uid} special={props.special} animated={props.animated} style={props.style} photo={props.photo} lookup={false} />
));
// ============================================================
// PERF: small memoized components that live OUTSIDE LiveRoom so a
// re-render of the big room screen doesn't re-render / restart them.
// ============================================================
// ===== SafeModal: LIVEROOM KA HAR POPUP IS SE KHULTA HAI =====
// Modal Android par alag window hota hai -> navigation bar ke neeche chala jata tha aur insets 0 aate the.
// Yaha Modal ke andar apna SafeAreaProvider + neeche navigation-bar jitni jagah chhodi gayi hai,
// isliye sheet / dialog sab nigetiv bar ke UPAR dikhte hain. Neeche ki patti bhi halki dim hoti hai.
export const ModalSafeBody = ({ children }) => {
  const insets = useSafeAreaInsets();
  const gap = navBarGap(insets.bottom);
  return (
    <View style={{ flex: 1, paddingBottom: gap }}>
      {children}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: gap, backgroundColor: 'rgba(0,0,0,0.5)' }} />
    </View>
  );
};
export const SafeModal = ({ children, ...props }) => (
  <Modal {...props}>
    <SafeAreaProvider>
      <ModalSafeBody>{children}</ModalSafeBody>
    </SafeAreaProvider>
  </Modal>
);
