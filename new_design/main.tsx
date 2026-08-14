import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAccent } from "./lib/theme";

initAccent();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!PUBLISHABLE_KEY) {
  // Fail loud in dev — never silent-auth with missing key
  console.error("Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env / Netlify env");
}

createRoot(document.getElementById("root")!).render(
  <App />
);
