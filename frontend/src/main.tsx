import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { DialogProvider } from "./components/Dialogs";
import { I18nProvider } from "./i18n";
import { TitleProvider } from "./layout/Title";
import { PrefsProvider } from "./prefs";
import "./styles.css";
import { captureInstallPrompt } from "./lib/install";

captureInstallPrompt();
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <PrefsProvider>
        <DialogProvider>
          <AuthProvider>
            <BrowserRouter>
              <TitleProvider>
                <App />
              </TitleProvider>
            </BrowserRouter>
          </AuthProvider>
        </DialogProvider>
      </PrefsProvider>
    </I18nProvider>
  </StrictMode>,
);
