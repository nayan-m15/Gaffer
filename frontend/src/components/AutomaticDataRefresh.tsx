import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectAutomaticRefresh } from "@/lib/query-client";

export function AutomaticDataRefresh() {
  const client = useQueryClient();
  useEffect(() => connectAutomaticRefresh(client), [client]);
  return null;
}
