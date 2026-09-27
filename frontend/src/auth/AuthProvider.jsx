import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiStatus } from "../constants/constants";
import api from "../utils/backendApi";
import { AuthContext } from "./authContext";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // The session lives in an httpOnly cookie, so ask the backend who we are
  useEffect(() => {
    api.get("/auth/me").then((result) => {
      setUser(result.status === ApiStatus.SUCCESS ? result.data : null);
      setIsLoading(false);
    });
  }, []);

  // Returns an error message to show, or null on success
  const signInWithGoogle = useCallback(async (credential) => {
    const result = await api.post("/auth/google", { credential });
    if (result.status !== ApiStatus.SUCCESS) return result.message;
    setUser(result.data);
    return null;
  }, []);

  // Re-reads the signed-in user, e.g. after the admin joins or leaves splitting
  const refreshUser = useCallback(async () => {
    const result = await api.get("/auth/me");
    if (result.status === ApiStatus.SUCCESS) setUser(result.data);
  }, []);

  const signOut = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, signInWithGoogle, refreshUser, signOut }),
    [user, isLoading, signInWithGoogle, refreshUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
