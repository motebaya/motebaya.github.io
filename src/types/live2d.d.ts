export {};

declare global {
  interface Window {
    loadlive2d: (canvasId: string, modelPath: string) => void;
    live2d_settings: Record<string, unknown>;
  }
}
