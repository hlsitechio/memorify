// types.d.ts — ambient type shim for optional native deps.
// @nut-tree/nut-js is an optionalDependency (native module); when it's not
// installed (e.g. during CI type-check), this shim keeps the build green.
// The real module's types are used when it IS installed.
declare module "@nut-tree/nut-js" {
  export const mouse: {
    getScreenSize(): Promise<{ width: number; height: number }>;
    setPosition(p: Promise<{ x: number; y: number }>): Promise<void>;
    click(button: unknown): Promise<void>;
    scrollDown(amount: number): Promise<void>;
  };
  export const keyboard: {
    type(text: string): Promise<void>;
    pressKey(key: unknown): Promise<void>;
  };
  export const Button: Record<string, unknown>;
  export const Key: Record<string, unknown>;
}
