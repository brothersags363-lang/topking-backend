// FALLBACK: agar VisionCamera / Skia install ya build me dikkat de,
// to is file ko "BeautyCamera.js" naam se replace kar do (purani ko hata kar).
// Ye purane expo-camera par chalta hai: filter/beauty camera par sirf
// approx parat (overlay) dikhegi, asli effect server final video me lagayega.
import React, { forwardRef } from "react";
import { StyleSheet } from "react-native";
import { CameraView } from "expo-camera";
import FilterOverlay from "../FilterOverlay";

const BeautyCamera = forwardRef(function BeautyCamera(
  { facing = "front", zoom = 0, enableTorch = false, onCameraReady, onMountError, filterId, fx, compare },
  ref
) {
  return (
    <>
      <CameraView
        ref={ref}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing={facing}
        zoom={zoom}
        enableTorch={enableTorch}
        onCameraReady={onCameraReady}
        onMountError={onMountError}
      />
      {!compare && <FilterOverlay filterId={filterId} fx={fx} />}
    </>
  );
});

export default React.memo(BeautyCamera);
