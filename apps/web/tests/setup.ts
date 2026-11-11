import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register({
  settings: {
    disableJavaScriptFileLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
  },
});

// React and Testing Library must initialize after the DOM globals are registered.
const { cleanup } = await import("@testing-library/react");
afterEach(() => {
  cleanup();
  delete window.turnstile;
  document.getElementById("cloudflare-turnstile-script")?.remove();
});
