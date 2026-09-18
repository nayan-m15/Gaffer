import { createAuthClient } from "better-auth/react";
import { apiUrl } from "@/lib/api-url";

const getBaseURL = () => {
  if (typeof window !== "undefined") {
    return new URL(apiUrl("/auth"), window.location.origin).toString();
  }
  return "http://localhost:3000/auth";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

