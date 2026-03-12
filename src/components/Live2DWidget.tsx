import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, Camera, X, Shirt } from "lucide-react";
import { useLive2D } from "@/hooks/useLive2D";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export default function Live2DWidget() {
  const {
    message,
    showMessage,
    canvasRef,
    dragHandlers,
    isLoaded,
    changeTexture,
    getScreenshotMessage,
    getHiddenMessage,
  } = useLive2D();
  const [hidden, setHidden] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleScreenshot = () => {
    const msg = getScreenshotMessage();
    if (msg) showMessage(msg, 5000, true);

    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement("a");
      link.download = "live2d-screenshot.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Screenshot failed silently
    }
  };

  const handleClose = () => {
    const msg = getHiddenMessage();
    if (msg) {
      showMessage(msg, 1300, true);
      setTimeout(() => setHidden(true), 1300);
    } else {
      setHidden(true);
    }
  };

  if (hidden) return null;

  return (
    <div
      className="waifu-container fixed bottom-0 left-0 z-30 select-none"
      style={{ touchAction: "none" }}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
            className="absolute -top-2 left-3 z-40 max-w-[220px] -translate-y-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 shadow-md dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool buttons (visible on hover, z-50 to sit above the canvas) */}
      <div className="absolute right-2 top-12 z-50 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 [.waifu-container:hover_&]:opacity-100">
        <button
          onClick={handleScrollTop}
          aria-label="Home"
          className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:text-stone-200"
        >
          <Home size={14} />
        </button>
        <button
          onClick={changeTexture}
          aria-label="Change outfit"
          className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:text-stone-200"
        >
          <Shirt size={14} />
        </button>
        <button
          onClick={handleScreenshot}
          aria-label="Screenshot"
          className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:text-stone-200"
        >
          <Camera size={14} />
        </button>
        <button
          onClick={handleClose}
          aria-label="Close widget"
          className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:text-stone-200"
        >
          <X size={14} />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        id="live2d"
        width={240}
        height={210}
        className={`relative max-w-full transition-opacity ${isLoaded ? "opacity-100" : "opacity-0"}`}
        onPointerDown={dragHandlers.onPointerDown}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}
