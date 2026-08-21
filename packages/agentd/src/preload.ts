// src/preload.ts — contextBridge for the hidden renderer window.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__memorifyIpc", {
  send: (msg: unknown) => ipcRenderer.send("memorify:renderer", msg),
  on: (cb: (msg: unknown) => void) =>
    ipcRenderer.on("memorify:main", (_ev, msg) => cb(msg)),
});
