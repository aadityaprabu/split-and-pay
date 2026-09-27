import { useState } from "react";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { useAuth } from "../auth/authContext";

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [errorMessage, setErrorMessage] = useState(null);

  const handleCredential = async (credential) => {
    setErrorMessage(null);
    const error = await signInWithGoogle(credential);
    if (error) setErrorMessage(error);
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div>
        <h1 className="text-3xl font-bold text-primary">Split & Pay</h1>
        <p className="mt-1 text-gray-600">Shared expenses for the flat</p>
      </div>
      <GoogleSignInButton onCredential={handleCredential} onError={setErrorMessage} />
      {errorMessage && <p className="max-w-xs text-sm text-red-600">{errorMessage}</p>}
    </main>
  );
}
