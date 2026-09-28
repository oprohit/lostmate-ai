"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export async function pickNativeImage() {
  if (!isNativePlatform()) return null;
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.DataUrl,
    quality: 84,
    width: 1600,
    correctOrientation: true,
    allowEditing: false,
  });
  return photo.dataUrl ?? null;
}

export async function registerNativeBackButton(onBack: () => void) {
  if (!isNativePlatform()) return () => undefined;
  const listener = await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) onBack();
    else onBack();
  });
  return () => listener.remove();
}
