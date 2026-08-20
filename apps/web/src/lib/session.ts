import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, adminApi, api } from "./apiClient.js";

/** 401 是「未登录」这个正常状态，不该无限重试，也不该冒泡成错误页 */
function noRetryOn401(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status === 401) return false;
  return failureCount < 2;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.me(),
    retry: noRetryOn401,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCurrentAdmin() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => adminApi.me(),
    retry: noRetryOn401,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.clear(),
  });
}

export function useAdminLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.logout(),
    onSuccess: () => qc.clear(),
  });
}
