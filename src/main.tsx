import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

// Last-resort guard: if a raw script error happens before/after React mounts,
// replace the blank page with a visible message instead of nothing.
window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root && root.childElementCount === 0) {
    root.innerHTML =
      '<div style="font-family:sans-serif;text-align:center;padding:40px 20px">' +
      '<div style="font-size:40px">🌸</div>' +
      '<h2>Something went wrong</h2>' +
      '<p style="color:#666;font-size:14px">Please reload the app.</p>' +
      '<button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;border-radius:12px;border:none;background:#ec4899;color:#fff;font-weight:600">Reload</button>' +
      '</div>';
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
