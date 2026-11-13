// Screen ke bichon-beech "⭐ 1 star received" popup, 3 second ke liye.
// Kisi bhi screen me <StarToastView /> laga do; ye khud star message sunta hai.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Text, View } from "react-native";
import { subscribeStarToast } from "./starToast";

const SHOW_MS = 3000;

export default function StarToastView() {
  const [text, setText] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;
  const timer = useRef(null);

  useEffect(() => {
    const unsub = subscribeStarToast((t) => {
      if (timer.current) clearTimeout(timer.current);
      setText(t);
      opacity.setValue(0);
      scale.setValue(0.7);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
          setText(null)
        );
      }, SHOW_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity, scale]);

  if (!text) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        elevation: 99999,
      }}
    >
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Image
          source={require("../assets/star-logo.png")}
          style={{ width: 56, height: 56, resizeMode: "contain" }}
        />
        <Text
          style={{
            color: "#ffffff",
            fontSize: 22,
            fontWeight: "800",
            marginLeft: 10,
            textShadowColor: "rgba(0,0,0,0.6)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          }}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}
