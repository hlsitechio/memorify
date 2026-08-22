// src/injector.ts — native Windows/cross-platform input injection via user32 / koffi
import koffi from "koffi";

export interface InputInjector {
  /** Move the mouse to absolute screen coordinates (0..1 normalized). */
  move(x: number, y: number): Promise<void>;
  /** Click a button: "left" | "right" | "middle". */
  click(button: string, x?: number, y?: number): Promise<void>;
  /** Type a string of text via Unicode keyboard events. */
  type(text: string): Promise<void>;
  /** Press a special key (e.g. "Enter", "Backspace", "Escape"). */
  key(key: string): Promise<void>;
  /** Scroll by a delta. */
  scroll(dx: number, dy: number): Promise<void>;
}

// Windows Virtual Key codes
const VK_MAP: Record<string, number> = {
  enter: 0x0d,
  return: 0x0d,
  backspace: 0x08,
  escape: 0x1b,
  tab: 0x09,
  " ": 0x20,
  space: 0x20,
  arrowleft: 0x25,
  arrowup: 0x26,
  arrowright: 0x27,
  arrowdown: 0x28,
  delete: 0x2e,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
};

export async function createInjector(): Promise<InputInjector | null> {
  if (process.platform !== "win32") {
    console.warn("[agentd:injector] Native input currently optimized for Windows win32");
    return null;
  }

  try {
    const user32 = koffi.load("user32.dll");
    const mouse_event = user32.func(
      "void __stdcall mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, uint32 dwData, uintptr_t dwExtraInfo)",
    );
    const keybd_event = user32.func(
      "void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)",
    );

    const MOUSEEVENTF_MOVE = 0x0001;
    const MOUSEEVENTF_LEFTDOWN = 0x0002;
    const MOUSEEVENTF_LEFTUP = 0x0004;
    const MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const MOUSEEVENTF_RIGHTUP = 0x0010;
    const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const MOUSEEVENTF_MIDDLEUP = 0x0040;
    const MOUSEEVENTF_WHEEL = 0x0800;
    const MOUSEEVENTF_ABSOLUTE = 0x8000;

    const KEYEVENTF_KEYUP = 0x0002;
    const KEYEVENTF_UNICODE = 0x0004;

    return {
      async move(x: number, y: number) {
        const clampedX = Math.min(1, Math.max(0, x));
        const clampedY = Math.min(1, Math.max(0, y));
        const absX = Math.round(clampedX * 65535);
        const absY = Math.round(clampedY * 65535);
        mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, absX, absY, 0, 0);
      },

      async click(button: string, x?: number, y?: number) {
        if (typeof x === "number" && typeof y === "number") {
          const clampedX = Math.min(1, Math.max(0, x));
          const clampedY = Math.min(1, Math.max(0, y));
          const absX = Math.round(clampedX * 65535);
          const absY = Math.round(clampedY * 65535);
          mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, absX, absY, 0, 0);
        }

        if (button === "right") {
          mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
        } else if (button === "middle") {
          mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
        } else {
          mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        }
      },

      async type(text: string) {
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          keybd_event(0, code, KEYEVENTF_UNICODE, 0);
          keybd_event(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0);
        }
      },

      async key(k: string) {
        const vk = VK_MAP[k.toLowerCase()];
        if (vk) {
          keybd_event(vk, 0, 0, 0);
          keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
        }
      },

      async scroll(_dx: number, dy: number) {
        const delta = -Math.round(dy * 3);
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta, 0);
      },
    };
  } catch (e) {
    console.error("[agentd:injector] Failed to initialize user32 input injector:", e);
    return null;
  }
}
