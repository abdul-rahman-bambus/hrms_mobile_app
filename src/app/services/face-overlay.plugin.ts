import { registerPlugin } from '@capacitor/core';

export interface FaceOverlayPlugin {
  drawRectangle(options: { 
    x: number; y: number; width: number; height: number; 
    imageWidth: number; imageHeight: number;
    frameLeft?: number; frameTop?: number; frameWidth?: number; frameHeight?: number;
  }): Promise<void>;
  clearRectangle(): Promise<void>;
}

export const FaceOverlay = registerPlugin<FaceOverlayPlugin>('FaceOverlay');
