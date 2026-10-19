import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { APP_VERSION, registerSW, startStaleVersionWatch } from "./lib/pwa";
import { clientConfig } from "./config/client";

console.log(`[${clientConfig.brandName}] App Version: ${APP_VERSION}`);

createRoot(document.getElementById("root")!).render(<App />);

window.addEventListener('load', () => {
  void registerSW();
  startStaleVersionWatch();
});
