import { useEffect, useRef } from "react";
import { ApiStatus, GoogleSignIn } from "../constants/constants";
import api from "../utils/backendApi";

let googleScriptPromise;

// Loads Google Identity Services once, no matter how many times the button mounts
function loadGoogleScript() {
  googleScriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GoogleSignIn.SCRIPT_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      googleScriptPromise = undefined; // allow a retry on the next mount
      reject(new Error("Could not load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

/**
 * Renders Google's own "Sign in with Google" button.
 * @param {(credential: string) => void} onCredential - called with the ID token to send to the backend
 * @param {(message: string) => void} onError
 */
export default function GoogleSignInButton({ onCredential, onError }) {
  const buttonContainerRef = useRef(null);

  // Keep the latest callbacks without re-initialising Google on every render
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let isMounted = true;

    async function setUpButton() {
      const config = await api.get("/auth/config");
      if (config.status !== ApiStatus.SUCCESS) {
        throw new Error("Couldn't reach the server. Try again in a moment.");
      }
      const googleClientId = config.data.googleClientId;
      if (!googleClientId) {
        throw new Error("Google sign-in isn't configured (GOOGLE_CLIENT_ID is empty on the backend).");
      }

      await loadGoogleScript();
      if (!isMounted) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (googleResponse) => onCredentialRef.current(googleResponse.credential),
      });
      window.google.accounts.id.renderButton(buttonContainerRef.current, GoogleSignIn.BUTTON_OPTIONS);
    }

    setUpButton().catch((error) => {
      if (isMounted) onErrorRef.current(error.message);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return <div ref={buttonContainerRef} className="min-h-11" />;
}
