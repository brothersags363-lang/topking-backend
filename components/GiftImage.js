// GiftImage: full-screen transparent animated image gift (animation: "img:<key>").
// Lottie / WebView gifts ki tarah hi GiftLayer isse render karta hai; hide hona
// giftsData.js ki `duration` se hota hai (har room me timer pehle se hai).
import React, { memo } from "react";
import { Dimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { giftImages } from "../assets/giftImages";

const { width, height } = Dimensions.get("window");

export const isImgGift = (a) => typeof a === "string" && a.startsWith("img:");

const GiftImage = memo(function GiftImage({ name }) {
  const source = giftImages[name];
  if (!source) return null;
  return (
    <ExpoImage
      source={source}
      contentFit="contain"
      cachePolicy="memory"
      transition={0}
      autoplay
      pointerEvents="none"
      style={{
        width,
        height: Math.min(height, (width * 16) / 9),
        backgroundColor: "transparent",
      }}
    />
  );
});

export default GiftImage;
