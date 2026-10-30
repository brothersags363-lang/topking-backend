// components/live/LiveElapsed.js
// Live kitni der se chal rahi hai (host + viewers dono ko dikhta hai).
// Sirf ye chhota component har second re-render hota hai, poori screen nahi.
import React, { memo, useEffect, useState } from "react";
import { Text, View } from "react-native";

const fmt = (ms) => {
  const diff = Math.max(0, ms);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
};

function LiveElapsed({ startTime, style }) {
  const [label, setLabel] = useState("00:00:00");

  useEffect(() => {
    if (!startTime) return undefined;
    const tick = () => setLabel(fmt(Date.now() - startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (!startTime) return null;

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.45)",
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
          marginLeft: 8,
        },
        style,
      ]}
    >
      <Text style={{ color: "#FF3B5C", fontSize: 9, marginRight: 4 }}>●</Text>
      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "bold", fontVariant: ["tabular-nums"] }}>
        {label}
      </Text>
    </View>
  );
}

export default memo(LiveElapsed);
