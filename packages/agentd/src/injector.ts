// src/injector.ts — input injection (mouse/keyboard) via @nut-tree-fork/nut-js
import { mouse, keyboard, screen, Button, Key, Point } from "@nut-tree-fork/nut-js";

// Disable auto delays for ultra-fast, real-time response
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

export interface InputInjector {
  /** Move the mouse to absolute screen coordinates (0..1 normalized). */
  move(x: number, y: number): Promise<void>;
  /** Click a button: "left" | "right" | "middle". */
  click(button: string, x?: number, y?: number): Promise<void>;
  /** Type a string of text. */
  type(text: string): Promise<void>;
  /** Press a key (e.g. "Enter", "Backspace", "Escape"). */
  key(key: string): Promise<void>;
  /** Scroll by a delta. */
  scroll(dx: number, dy: number): Promise<void>;
}

const BUTTON_MAP: Record<string, Button> = {
  left: Button.LEFT,
  right: Button.RIGHT,
  middle: Button.MIDDLE,
};

const KEY_MAP: Record<string, Key> = {
  enter: Key.Enter,
  return: Key.Enter,
  backspace: Key.Backspace,
  escape: Key.Escape,
  tab: Key.Tab,
  " ": Key.Space,
  space: Key.Space,
  arrowup: Key.Up,
  arrowdown: Key.Down,
  arrowleft: Key.Left,
  arrowright: Key.Right,
  delete: Key.Delete,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
};

export async function createInjector(): Promise<InputInjector | null> {
  try {
    const screenWidth = (await screen.width().catch(() => 1920)) || 1920;
    const screenHeight = (await screen.height().catch(() => 1080)) || 1080;
    console.log(`[agentd:injector] @nut-tree-fork/nut-js ready — Screen size: ${screenWidth}x${screenHeight}`);

    return {
      async move(x: number, y: number) {
        const targetX = Math.round(Math.min(1, Math.max(0, x)) * screenWidth);
        const targetY = Math.round(Math.min(1, Math.max(0, y)) * screenHeight);
        await mouse.setPosition(new Point(targetX, targetY));
      },

      async click(button: string, x?: number, y?: number) {
        if (typeof x === "number" && typeof y === "number") {
          const targetX = Math.round(Math.min(1, Math.max(0, x)) * screenWidth);
          const targetY = Math.round(Math.min(1, Math.max(0, y)) * screenHeight);
          await mouse.setPosition(new Point(targetX, targetY));
        }
        const b = BUTTON_MAP[button.toLowerCase()] ?? Button.LEFT;
        await mouse.click(b);
      },

      async type(text: string) {
        await keyboard.type(text);
      },

      async key(k: string) {
        const keyEnum = KEY_MAP[k.toLowerCase()];
        if (keyEnum !== undefined) {
          await keyboard.pressKey(keyEnum);
          await keyboard.releaseKey(keyEnum);
        }
      },

      async scroll(_dx: number, dy: number) {
        const delta = Math.round(dy);
        if (delta > 0) {
          await mouse.scrollDown(Math.min(10, delta));
        } else if (delta < 0) {
          await mouse.scrollUp(Math.min(10, Math.abs(delta)));
        }
      },
    };
  } catch (e) {
    console.error("[agentd:injector] Failed to initialize nut-js injector:", e);
    return null;
  }
}
