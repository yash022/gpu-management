import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import api, { setCsrfToken } from "../api/axios";
import { AuthContext } from "./auth-state";
const broadcast = (action) => {
  try {
    localStorage.setItem(
      "gpuspace:auth-event",
      JSON.stringify({ action, nonce: crypto.randomUUID() }),
    );
  } catch {
    /* Storage may be disabled; focus revalidation still works. */
  }
};
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const currentUser = useRef(null);
  const logoutPending = useRef(null);
  const applySession = useCallback((data) => {
    setCsrfToken(data.csrfToken);
    currentUser.current = data.user;
    setUser(data.user);
    setLoading(false);
    setSessionError("");
    setNotice("");
  }, []);
  const clear = useCallback((message) => {
    generation.current++;
    setCsrfToken(null);
    currentUser.current = null;
    setUser(null);
    setLoading(false);
    setSessionError("");
    setNotice(message);
  }, []);
  const refreshSession = useCallback(
    async (blocking = false) => {
      if (logoutPending.current) return;
      const revision = ++generation.current;
      if (blocking) setLoading(true);
      try {
        const { data } = await api.get("/auth/me");
        if (revision === generation.current) applySession(data);
      } catch (error) {
        if (revision !== generation.current) return;
        if (error.response?.status === 401)
          clear(
            currentUser.current
              ? "Your session has expired. Please sign in again."
              : "",
          );
        else {
          setSessionError(
            "We could not verify your session. Check your connection and retry.",
          );
          setLoading(false);
        }
      }
    },
    [applySession, clear],
  );
  useEffect(() => {
    // Remove credentials left by older versions. Session cookies are HttpOnly.
    try {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
    } catch {
      /* Cookie sessions work without web storage. */
    }
    refreshSession();
    const expired = () =>
      clear("Your session has expired. Please sign in again.");
    const storage = (event) => {
      if (event.key !== "gpuspace:auth-event") return;
      try {
        if (JSON.parse(event.newValue)?.action === "logout")
          clear("You have been signed out.");
        else refreshSession(true);
      } catch {
        /* Ignore unrelated malformed events. */
      }
    };
    const focus = () => {
      if (document.visibilityState === "visible") refreshSession();
    };
    const timer = setInterval(() => {
      if (currentUser.current && document.visibilityState === "visible")
        refreshSession();
    }, 60000);
    window.addEventListener("session-expired", expired);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    const requestGeneration = generation;
    return () => {
      requestGeneration.current++;
      clearInterval(timer);
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
    };
  }, [refreshSession, clear]);
  const login = useCallback(
    async (email, password, remember = false) => {
      const revision = ++generation.current;
      const { data } = await api.post("/auth/login", {
        email: email.trim(),
        password,
        remember,
      });
      if (revision === generation.current) {
        applySession(data);
        broadcast("login");
      }
      return data.user;
    },
    [applySession],
  );
  const register = useCallback(
    async (name, email, password, role) => {
      const revision = ++generation.current;
      const { data } = await api.post("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      if (revision === generation.current) {
        applySession(data);
        broadcast("login");
      }
      return data;
    },
    [applySession],
  );
  const logout = useCallback(
    (all = false) => {
      if (logoutPending.current) return logoutPending.current;
      generation.current++;
      logoutPending.current = api
        .post(all ? "/auth/logout-all" : "/auth/logout")
        .then(() => {
          clear(
            all
              ? "You have been signed out on all devices."
              : "You have been signed out.",
          );
          broadcast("logout");
        })
        .catch((error) => {
          if (error.response?.status === 401) {
            clear("Your session has expired. Please sign in again.");
            broadcast("logout");
          } else throw error;
        })
        .finally(() => {
          logoutPending.current = null;
        });
      return logoutPending.current;
    },
    [clear],
  );
  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        loading,
        sessionError,
        refreshSession,
        notice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
