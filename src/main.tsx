// Lazy-load Buffer polyfill — only needed by crypto/wallet features, not on critical path
import("buffer").then(({ Buffer }) => { (window as any).Buffer = Buffer; });

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
