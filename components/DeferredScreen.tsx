// =====================================================================
// DeferredScreen.tsx — bhaari screen TAP KARTE HI khulti dikhe (Instagram jaisa)
//
// Pehle: LiveRoom (5000+ lines), chat, videolive jaisi screen par tap -> pehle poora bhaari
// code banta tha, tab jaake page khulna shuru hota tha (tap ke baad 0.3-1 sec kuch nahi).
// Ab: pehle frame me sirf halka kaala page (animation turant shuru), bhaari hissa
// 2 frame baad banta hai. Screen ka koi logic / hook badla nahi.
//
//   function LiveRoom() { ... }
//   export default withDeferredMount(LiveRoom);
// =====================================================================
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

function DefaultPlaceholder() {
  return (
    <View style={styles.box}>
      <ActivityIndicator color="#FFD700" />
    </View>
  );
}

export function withDeferredMount<P extends object>(
  Comp: React.ComponentType<P>,
  Placeholder: React.ComponentType<any> = DefaultPlaceholder
) {
  function Deferred(props: P) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      let r2: any = null;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setReady(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }, []);
    return ready ? <Comp {...props} /> : <Placeholder />;
  }
  Deferred.displayName = `Deferred(${Comp.displayName || Comp.name || 'Screen'})`;
  return Deferred;
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});

export default withDeferredMount;
