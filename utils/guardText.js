// Comment / chat bhejne se pehle gali check.
//   if (blockIfProfane(text)) return;   // gali mili -> alert dikha kar true return karta hai
//
// Ye sirf pehli rok hai (UX). Asli rok server par hai: functions/index.js (moderate* triggers)
// gali wala koi bhi comment/chat bante hi delete kar deta hai, chahe app modified ho.
import { Alert } from "react-native";
import { isClean, PROFANITY_TITLE, PROFANITY_MESSAGE } from "./profanity";

export function blockIfProfane(text) {
  if (isClean(text)) return false;
  Alert.alert(PROFANITY_TITLE, PROFANITY_MESSAGE);
  return true;
}
