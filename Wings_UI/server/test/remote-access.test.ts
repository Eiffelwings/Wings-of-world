import { describe, it, expect } from "vitest";
import {
  evaluateRemoteAccess,
  isPublicBindHost,
  shouldProtectRemotePath,
} from "../features/remote-access.js";

describe("remote access policy", () => {
  it("detects public bind hosts", () => {
    expect(isPublicBindHost("0.0.0.0")).toBe(true);
    expect(isPublicBindHost("::")).toBe(true);
    expect(isPublicBindHost("127.0.0.1")).toBe(false);
    expect(isPublicBindHost("localhost")).toBe(false);
  });

  it("protects API and metrics paths only", () => {
    expect(shouldProtectRemotePath("/api/chat/sessions")).toBe(true);
    expect(shouldProtectRemotePath("/metrics")).toBe(true);
    expect(shouldProtectRemotePath("/healthz")).toBe(false);
    expect(shouldProtectRemotePath("/readyz")).toBe(false);
  });

  it("blocks remote API requests until app auth is enabled", () => {
    const decision = evaluateRemoteAccess({
      pathname: "/api/chat/sessions",
      isLoopback: false,
      authEnabled: false,
      authenticated: false,
      allowAnonymousApi: false,
    });
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.status).toBe(403);
  });

  it("allows loopback API requests before app auth bootstrap", () => {
    expect(
      evaluateRemoteAccess({
        pathname: "/api/chat/sessions",
        isLoopback: true,
        authEnabled: false,
        authenticated: false,
        allowAnonymousApi: false,
      }).allow,
    ).toBe(true);
  });

  it("requires auth for remote metrics when app auth is enabled", () => {
    const unauthenticated = evaluateRemoteAccess({
      pathname: "/metrics",
      isLoopback: false,
      authEnabled: true,
      authenticated: false,
      allowAnonymousApi: false,
    });
    expect(unauthenticated.allow).toBe(false);
    if (!unauthenticated.allow) expect(unauthenticated.status).toBe(401);

    expect(
      evaluateRemoteAccess({
        pathname: "/metrics",
        isLoopback: false,
        authEnabled: true,
        authenticated: true,
        allowAnonymousApi: false,
      }).allow,
    ).toBe(true);
  });

  it("keeps remote login available after app auth exists", () => {
    expect(
      evaluateRemoteAccess({
        pathname: "/api/auth/login",
        isLoopback: false,
        authEnabled: true,
        authenticated: false,
        allowAnonymousApi: true,
      }).allow,
    ).toBe(true);
  });
});
