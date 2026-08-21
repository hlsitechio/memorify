// src/injector.ts — input injection (mouse/keyboard) via @nut-tree/nut-js.
//
// nut.js is a native module (needs to be installed + rebuilt for the target
// platform). This module lazy-loads it so the daemon still runs (shell +
// screen streaming) even if the native input module is unavailable.
//
// SECURITY: this is the most sensitive part of the daemon — it moves the
// user's mouse and types on their keyboard. It is only reachable through an
// authenticated control session, and every event is logged by the backend.

export interface InputInjector {
  /** Move the mouse to absolute screen coordinates (0..1 normalized). */
  move(x: number, y: number): Promise<void>;
  /** Click a button: "left" | "right" | "middle". */
  click(button: string): Promise<void>;
  /** Type a string of text. */
  type(text: string): Promise<void>;
  /** Press a key (e.g. "Enter", "Backspace", "Escape"). */
  key(key: string): Promise<void>;
  /** Scroll by a delta. */
  scroll(dx: number, dy: number): Promise<void>;
}

export async function createInjector(): Promise<InputInjector | null> {
  let nut: any;
  try {
    nut = await import("@nut-tree/nut-js");
  } catch {
    console.warn(
      "@nut-tree/nut-js not installed — input injection disabled (screen view only).",
    );
    return null;
  }

  const { mouse, keyboard, Button, Key } = nut;

  // Map button names to nut.js Button enum.
  const buttonMap: Record<string, any> = {
    left: Button.LEFT,
    right: Button.RIGHT,
    middle: Button.MIDDLE,
  };

  // Map common key names to nut.js Key enum (best-effort).
  const keyMap: Record<string, any> = {
    enter: Key.Enter,
    return: Key.Enter,
    backspace: Key.Backspace,
    escape: Key.Escape,
    esc: Key.Escape,
    tab: Key.Tab,
    space: Key.Space,
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,
    delete: Key.Delete,
    home: Key.Home,
    end: Key.End,
    pageup: Key.PageUp,
    pagedown: Key.PageDown,
  };

  return {
    async move(x: number, y: number) {
      // x,y are normalized 0..1; convert to absolute pixels.
      const { width, height } = await mouse.getScreenSize();
      await mouse.setPosition(
        Promise.resolve({ x: Math.round(x * width), y: Math.round(y * height) }),
      );
    },
    async click(button: string) {
      const b = buttonMap[button] ?? Button.LEFT;
      await mouse.click(b);
    },
    async type(text: string) {
      await keyboard.type(text);
    },
    async key(key: string) {
      const k = keyMap[key.toLowerCase()];
      if (k) await keyboard.pressKey(k);
    },
    async scroll(dx: number, dy: number) {
      await mouse.scrollDown(Math.round(dy));
    },
  };
}
