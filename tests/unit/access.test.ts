import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_COOKIE,
  accessDeniedMessage,
  accessToken,
  codeMatches,
  hasAccess,
  readCookie,
} from "@/lib/access";
import { requireAccess } from "@/lib/services/access";

describe("codeMatches", () => {
  it("accepts the exact code and rejects anything else", () => {
    expect(codeMatches("blue-heron-42", "blue-heron-42")).toBe(true);
    expect(codeMatches("blue-heron-43", "blue-heron-42")).toBe(false);
    expect(codeMatches("Blue-heron-42", "blue-heron-42")).toBe(false);
  });

  it("handles codes of different lengths without throwing", () => {
    // timingSafeEqual throws on unequal lengths; hashing first avoids that.
    expect(codeMatches("x", "a-much-longer-code")).toBe(false);
    expect(codeMatches("", "code")).toBe(false);
  });
});

describe("accessToken", () => {
  it("is stable for a code, differs between codes, and doesn't contain the code", () => {
    expect(accessToken("blue-heron-42")).toBe(accessToken("blue-heron-42"));
    expect(accessToken("blue-heron-42")).not.toBe(accessToken("blue-heron-43"));
    expect(accessToken("blue-heron-42")).not.toContain("blue-heron-42");
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("a=1; spec2test_access=abc; b=2", ACCESS_COOKIE)).toBe("abc");
  });

  it("keeps '=' inside a value", () => {
    expect(readCookie("spec2test_access=ab=c", ACCESS_COOKIE)).toBe("ab=c");
  });

  it("returns null without the cookie or without a header", () => {
    expect(readCookie("a=1", ACCESS_COOKIE)).toBeNull();
    expect(readCookie(null, ACCESS_COOKIE)).toBeNull();
  });
});

describe("hasAccess", () => {
  it("lets everyone in when no access code is configured", () => {
    expect(hasAccess(null, undefined)).toBe(true);
  });

  it("requires the token for the configured code", () => {
    expect(hasAccess(accessToken("blue-heron-42"), "blue-heron-42")).toBe(true);
    expect(hasAccess(null, "blue-heron-42")).toBe(false);
    expect(hasAccess(accessToken("old-code"), "blue-heron-42")).toBe(false);
    // The raw code is not a valid cookie value.
    expect(hasAccess("blue-heron-42", "blue-heron-42")).toBe(false);
  });
});

describe("requireAccess", () => {
  afterEach(() => vi.unstubAllEnvs());

  function request(cookie?: string) {
    return new Request("http://localhost/api/chat", {
      method: "POST",
      headers: cookie ? { cookie } : {},
    });
  }

  it("does nothing when demo mode is off", () => {
    vi.stubEnv("ACCESS_CODE", "");
    expect(requireAccess(request())).toBeNull();
  });

  it("refuses a request without the cookie with a 401 the browser can recognise", async () => {
    vi.stubEnv("ACCESS_CODE", "blue-heron-42");
    const response = requireAccess(request());
    expect(response?.status).toBe(401);
    const body = await response?.json();
    expect(body.accessRequired).toBe(true);
    expect(body.error).toContain("access code");
    expect(body.error).not.toContain("blue-heron-42");
  });

  it("lets a request with a valid cookie through", () => {
    vi.stubEnv("ACCESS_CODE", "blue-heron-42");
    const cookie = `${ACCESS_COOKIE}=${accessToken("blue-heron-42")}`;
    expect(requireAccess(request(cookie))).toBeNull();
  });
});

describe("accessDeniedMessage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("says how to get a code when a contact is configured", () => {
    vi.stubEnv("ACCESS_CODE_CONTACT", "email the author");
    expect(accessDeniedMessage()).toContain("To get a code, email the author.");
  });

  it("falls back to a generic hint", () => {
    vi.stubEnv("ACCESS_CODE_CONTACT", "");
    expect(accessDeniedMessage()).toContain("ask whoever shared this link");
  });
});
