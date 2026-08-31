import { createAuthClient } from "better-auth/react";

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/auth`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth`;
  }
  return "http://localhost:3000/auth";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
