import axios from "axios";
let csrfToken = null;
let sessionVersion = 0;
export function setCsrfToken(value) {
  if (csrfToken !== value) sessionVersion++;
  csrfToken = value;
}
const api = axios.create({
  timeout: 15000,
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  headers: { "X-Requested-With": "GPUspace" },
});
api.interceptors.request.use((config) => {
  config.sessionVersion = sessionVersion;
  if (csrfToken && !["get", "head", "options"].includes(config.method))
    config.headers["X-CSRF-Token"] = csrfToken;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.config?.sessionVersion === sessionVersion &&
      !error.config?.url?.startsWith("/auth/")
    ) {
      window.dispatchEvent(new Event("session-expired"));
    }
    return Promise.reject(error);
  },
);
export function authError(error, fallback) {
  if (!error.response)
    return "We could not reach the server. Check your connection and try again.";
  if (error.response.status === 429) {
    const minutes = Math.max(
      1,
      Math.ceil(Number(error.response.headers["retry-after"] || 900) / 60),
    );
    return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return error.response.data?.message || fallback;
}
export default api;
