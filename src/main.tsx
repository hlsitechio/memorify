import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAccent } from "./lib/theme";

initAccent();
createRoot(document.getElementById("root")!).render(<App />);
