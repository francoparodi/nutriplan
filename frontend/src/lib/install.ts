/** The browser's own install banner is suppressed: Nutriplan does not nag users to install it.
 *  The manifest and icons stay in place, so "Add to Home screen" from the browser menu still works. */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => e.preventDefault());
}
