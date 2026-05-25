export type RemoteAccessDecision =
  | { allow: true }
  | { allow: false; status: 401 | 403; error: string };

export function isPublicBindHost(host: string | undefined): boolean {
  const normalized = String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "";
}

export function shouldProtectRemotePath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/metrics";
}

export function evaluateRemoteAccess(params: {
  pathname: string;
  isLoopback: boolean;
  authEnabled: boolean;
  authenticated: boolean;
  allowAnonymousApi: boolean;
}): RemoteAccessDecision {
  if (params.isLoopback || !shouldProtectRemotePath(params.pathname)) {
    return { allow: true };
  }

  if (!params.authEnabled) {
    return {
      allow: false,
      status: 403,
      error:
        "Remote Wings Of World access is blocked until local app authentication is enabled from a loopback session.",
    };
  }

  if (params.pathname === "/metrics" && !params.authenticated) {
    return {
      allow: false,
      status: 401,
      error: "Wings Of World app authentication is required for metrics.",
    };
  }

  if (params.pathname.startsWith("/api/") && !params.allowAnonymousApi && !params.authenticated) {
    return {
      allow: false,
      status: 401,
      error: "Wings Of World app authentication is required for this API route.",
    };
  }

  return { allow: true };
}
