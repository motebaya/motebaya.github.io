import { useEffect, useRef, useState, useCallback } from "react";

const LIVE2D_API = "https://live2d.fghrsh.net/api/";

interface Live2DConfig {
  waifu: {
    console_open_msg: string[];
    copy_message: string[];
    screenshot_message: string[];
    hidden_message: string[];
    load_rand_textures: string[];
    hour_tips: Record<string, string[]>;
    referrer_message: Record<string, string[]>;
    referrer_hostname: Record<string, string[]>;
    model_message: Record<string, string[]>;
  };
  mouseover: Array<{ selector: string; text: string[] }>;
  click: Array<{ selector: string; text: string[] }>;
}

function getRandText(arr: string[]): string {
  if (arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)] ?? "";
}

function getTimeGreeting(tips: Record<string, string[]>): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return getRandText(tips["t5-7"] ?? []);
  if (hour >= 7 && hour < 11) return getRandText(tips["t7-11"] ?? []);
  if (hour >= 11 && hour < 14) return getRandText(tips["t11-14"] ?? []);
  if (hour >= 14 && hour < 17) return getRandText(tips["t14-17"] ?? []);
  if (hour >= 17 && hour < 19) return getRandText(tips["t17-19"] ?? []);
  if (hour >= 19 && hour < 21) return getRandText(tips["t19-21"] ?? []);
  if (hour >= 21 && hour < 23) return getRandText(tips["t21-23"] ?? []);
  if (hour >= 23 || hour < 5) return getRandText(tips["t23-5"] ?? []);
  return getRandText(tips["default"] ?? []);
}

/**
 * Build a referrer-aware welcome message.
 * - Direct visit (no referrer) → referrer_message.none
 * - Same-site navigation       → referrer_message.localhost
 * - Known external hostname    → referrer_hostname[host]
 * - Unknown external referrer  → referrer_message.default
 * Falls back to a time-based greeting when no referrer message matches.
 */
function getWelcomeMessage(config: Live2DConfig): string {
  const { referrer_message, referrer_hostname, hour_tips } = config.waifu;
  const referrer = document.referrer;

  if (!referrer) {
    // Direct visit – no referrer
    return getRandText(referrer_message["none"] ?? []) || getTimeGreeting(hour_tips);
  }

  try {
    const refUrl = new URL(referrer);

    // Same-site navigation (or localhost dev)
    if (refUrl.hostname === window.location.hostname) {
      return getRandText(referrer_message["localhost"] ?? []) || getTimeGreeting(hour_tips);
    }

    // Check known hostnames from config
    for (const [hostname, messages] of Object.entries(referrer_hostname)) {
      if (refUrl.hostname === hostname) {
        return getRandText(messages);
      }
    }

    // Unknown external referrer
    return getRandText(referrer_message["default"] ?? []);
  } catch {
    return getRandText(referrer_message["none"] ?? []) || getTimeGreeting(hour_tips);
  }
}

export interface UseLive2DReturn {
  message: string;
  showMessage: (text: string, duration?: number, priority?: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  isLoaded: boolean;
  changeTexture: () => void;
  getScreenshotMessage: () => string;
  getHiddenMessage: () => string;
}

export function useLive2D(): UseLive2DReturn {
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState<Live2DConfig | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priorityRef = useRef(false);
  const lastHoverRef = useRef<Element | null>(null);
  const dragRef = useRef({ dragging: false, startX: 0, offsetX: 0 });
  const containerRef = useRef<HTMLElement | null>(null);
  const modelRef = useRef({ modelId: 1, textureId: 0 });

  // ── showMessage with priority ──────────────────────────────────────
  // If a priority message is active, non-priority messages are silently
  // dropped – this prevents casual mouseover tips from overriding
  // important messages (welcome, copy, screenshot, etc.).
  const showMessage = useCallback((text: string, duration = 5000, priority = false) => {
    if (!text) return;
    if (priorityRef.current && !priority) return;

    setMessage(text);
    priorityRef.current = priority;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMessage("");
      priorityRef.current = false;
    }, duration);
  }, []);

  // ── Load model onto the canvas ─────────────────────────────────────
  const loadModel = useCallback((modelId: number, textureId: number) => {
    if (typeof window.loadlive2d !== "function") return;
    modelRef.current = { modelId, textureId };
    window.loadlive2d("live2d", `${LIVE2D_API}get/?id=${modelId}-${textureId}`);
  }, []);

  // ── Fetch a random texture and reload ──────────────────────────────
  const changeTexture = useCallback(() => {
    const { modelId, textureId } = modelRef.current;
    fetch(`${LIVE2D_API}rand_textures/?id=${modelId}-${textureId}`)
      .then((r) => r.json())
      .then((data: { textures: { id: number } }) => {
        const newTextureId = data.textures.id;
        loadModel(modelId, newTextureId);
        if (config) {
          const msgs = config.waifu.load_rand_textures;
          const msg =
            newTextureId === textureId ? (msgs[0] ?? "") : (msgs[msgs.length - 1] ?? msgs[0] ?? "");
          showMessage(msg, 3000, true);
        }
      })
      .catch(() => {
        // Texture switch failed silently
      });
  }, [config, loadModel, showMessage]);

  // ── Config message getters (for widget buttons) ────────────────────
  const getScreenshotMessage = useCallback(() => {
    return config ? getRandText(config.waifu.screenshot_message) : "";
  }, [config]);

  const getHiddenMessage = useCallback(() => {
    return config ? getRandText(config.waifu.hidden_message) : "";
  }, [config]);

  // ── Load config ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/live2d-config.json")
      .then((r) => r.json())
      .then((data: Live2DConfig) => setConfig(data))
      .catch(() => {
        // Config failed to load – widget renders without messages
      });
  }, []);

  // ── Load live2d script and init model ──────────────────────────────
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/live2d/live2d.min.js";
    script.async = true;
    script.onload = () => {
      try {
        const initTextureId = Math.floor(Math.random() * 91);
        loadModel(1, initTextureId);
        setIsLoaded(true);
      } catch {
        // Live2D init failed silently
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [loadModel]);

  // ── Welcome message (referrer-aware, replaces plain hour greeting) ─
  useEffect(() => {
    if (!config || !isLoaded) return;
    const welcome = getWelcomeMessage(config);
    if (welcome) {
      showMessage(welcome, 6000, true);
    }
  }, [config, isLoaded, showMessage]);

  // ── Event-delegated mouseover & click handlers ─────────────────────
  // Uses document-level delegation so dynamically-loaded elements
  // (e.g. lazy ProjectList) are handled automatically.
  useEffect(() => {
    if (!config) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as Element;
      for (const entry of config.mouseover) {
        const matched = target.closest(entry.selector);
        if (matched) {
          // Only fire when we enter a *new* matching element
          if (matched !== lastHoverRef.current) {
            lastHoverRef.current = matched;
            showMessage(getRandText(entry.text), 3000);
          }
          return;
        }
      }
      // Pointer left all tracked regions
      lastHoverRef.current = null;
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      for (const entry of config.click) {
        if (target.closest(entry.selector)) {
          showMessage(getRandText(entry.text), 3000, true);
          return;
        }
      }
    };

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("click", handleClick);
    };
  }, [config, showMessage]);

  // ── Copy event ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    const handler = () => {
      showMessage(getRandText(config.waifu.copy_message), 5000, true);
    };
    document.addEventListener("copy", handler);
    return () => document.removeEventListener("copy", handler);
  }, [config, showMessage]);

  // ── Visibility change – greet when tab refocused ───────────────────
  useEffect(() => {
    if (!config || !isLoaded) return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        const greeting = getTimeGreeting(config.waifu.hour_tips);
        if (greeting) showMessage(greeting, 5000);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [config, isLoaded, showMessage]);

  // ── Console / DevTools detection (Easter egg) ──────────────────────
  // The regex's toString is lazily invoked when DevTools renders the
  // logged value, so the message appears when the user opens the console.
  useEffect(() => {
    if (!config || !isLoaded) return;
    const re = /live2d/;
    const msgs = config.waifu.console_open_msg;
    re.toString = () => {
      showMessage(getRandText(msgs), 5000, true);
      return "";
    };
    console.log(re);
  }, [config, isLoaded, showMessage]);

  // ── Drag handlers (x-axis only, snaps back on release) ─────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const container = (e.currentTarget as HTMLElement).closest(".waifu-container");
    if (!container) return;
    containerRef.current = container as HTMLElement;

    const rect = container.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      offsetX: rect.left,
    };

    // Remove transition during drag for immediate feedback
    (container as HTMLElement).style.transition = "none";

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragRef.current.dragging || !containerRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const newLeft = dragRef.current.offsetX + dx;
      containerRef.current.style.left = `${newLeft}px`;
      containerRef.current.style.right = "auto";
    };

    const onPointerUp = () => {
      dragRef.current.dragging = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);

      // Snap back to original position (bottom-left corner)
      if (containerRef.current) {
        containerRef.current.style.transition = "left 0.4s ease";
        containerRef.current.style.left = "0px";
        containerRef.current.style.right = "auto";
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  return {
    message,
    showMessage,
    canvasRef,
    dragHandlers: { onPointerDown },
    isLoaded,
    changeTexture,
    getScreenshotMessage,
    getHiddenMessage,
  };
}
