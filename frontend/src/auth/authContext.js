import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

/**
 * user.is_admin: can manage who signs in. user.is_participant: on the allowed list, so can split expenses.
 * @returns {{ user: object | null, isLoading: boolean, signInWithGoogle: Function, refreshUser: Function, signOut: Function }}
 */
export function useAuth() {
  return useContext(AuthContext);
}
