import { createPublicKey, verify } from "node:crypto";
import type { SlideThemeMap } from "@/lib/slide";
import type { PageTemplateMap } from "@/lib/page";
import type { User } from "@/lib/types";
import { emailToDisplayName } from "@/lib/avatar";

interface KumiDocsPermissions {
  instanceName?: string;
  repoUrl?: string;
  editors?: string[];
  slideThemes?: SlideThemeMap;
  pageTemplates?: PageTemplateMap;
  sidebarDefaultDepth?: number;
  hideFiles?: string[];
}

let perms: KumiDocsPermissions = {};
let isReadonly = false;

/** Optional JWKS for JWT signature verification. */
let jwtKeys:
  | Map<string, { alg: string; key: string | Buffer | Record<string, unknown> }>
  | undefined;
let jwtKids: string[] | undefined;

const getJwtKids = (): string[] | undefined => jwtKids;

const setPermissions = (permissions: KumiDocsPermissions): void => {
  perms = permissions;
};

const getPermissions = (): KumiDocsPermissions => perms;

const setReadonly = (value: boolean): void => {
  isReadonly = value;
};

const getReadonly = (): boolean => isReadonly;

/** Configure JWT verification keys from a JWKS object. */
const setJwtJwks = (jwks: { keys: Record<string, unknown>[] } | undefined): void => {
  if (jwks === undefined || jwks.keys.length === 0) {
    jwtKeys = undefined;
    jwtKids = undefined;
    return;
  }
  const map = new Map<string, { alg: string; key: string | Buffer | Record<string, unknown> }>();
  const kids: string[] = [];
  for (const jwk of jwks.keys) {
    const kid = typeof jwk.kid === "string" ? jwk.kid : undefined;
    const kty = typeof jwk.kty === "string" ? jwk.kty : undefined;
    if (kid !== undefined && kty !== undefined) {
      map.set(kid, { alg: typeof jwk.alg === "string" ? jwk.alg : "RS256", key: { ...jwk } });
      kids.push(kid);
    }
  }
  jwtKeys = map.size > 0 ? map : undefined;
  jwtKids = kids.length > 0 ? kids : undefined;
};

/** Parse the `kumidocs_email` cookie value from a Cookie header string. */
const cookieEmail = (cookieHeader: string | null): string | undefined => {
  if (cookieHeader === null || cookieHeader === "") {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...cookieValueParts] = part.trim().split("=");
    if (cookieName?.trim() === "kumidocs_email") {
      const raw = decodeURIComponent(cookieValueParts.join("=").trim());
      if (raw !== "") {
        return raw;
      }
    }
  }
  return undefined;
};

interface JWTPayload {
  email?: string;
  preferred_username?: string;
}

interface JWTHeader {
  alg?: string;
  kid?: string;
}

// Base64url helpers
const base64UrlDecode = (str: string): string => {
  const base64 = str.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
};

const base64UrlToBytes = (str: string): Uint8Array => {
  const binary = base64UrlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    // oxlint-disable-next-line unicorn/prefer-code-point
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/** Regex matching a valid JWT (three base64url/base64 segments separated by dots).
 * Base64url uses [A-Za-z0-9_-] and may include '=' padding.
 * Notably does NOT contain '@', so dotted email local-parts
 * (e.g. "some.name@example.com") won't be mistaken for JWTs.
 * ALB OIDC identity/data headers use base64 with '=' padding,
 * so we allow optional '=' at the end of each segment. */
const JWT_REGEX = /^[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*$/u;

/** Verify a JWT signature against the configured JWKS and extract the email claim. */
const resolveJwtEmail = (value: string): string | undefined => {
  const parts = value.split(".");
  const headerB64 = parts[0] ?? "";
  const payloadB64 = parts[1] ?? "";
  const signatureB64 = parts[2] ?? "";

  // Parse header to find the key ID
  let header: JWTHeader;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    header = JSON.parse(base64UrlDecode(headerB64)) as JWTHeader;
  } catch {
    return undefined;
  }

  // Parse payload to extract email
  let payload: JWTPayload;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;
  } catch {
    return undefined;
  }

  // If JWKS is configured, verify the signature
  if (jwtKeys !== undefined) {
    // Reject "alg: none" -- the JWT MUST be signed by a configured key
    if (header.alg === "none" || header.alg === undefined || header.alg === "") {
      return undefined;
    }

    const kid = header.kid;
    if (kid === undefined || kid === "") {
      return undefined;
    }
    const jwkEntry = jwtKeys.get(kid);
    if (jwkEntry === undefined) {
      return undefined;
    }

    try {
      const publicKey = createPublicKey({
        format: "jwk",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        key: jwkEntry.key as Record<string, unknown>,
      });
      const data = `${headerB64}.${payloadB64}`;
      const signature = base64UrlToBytes(signatureB64);
      // Map JWT algorithm names to Node.js crypto verify algorithm names.
      // Only RSA-based algorithms are supported (keys are filtered by kty).
      const ALG_MAP: Record<string, string> = {
        RS256: "rsa-sha256",
        RS384: "rsa-sha384",
        RS512: "rsa-sha512",
      };
      const algorithm = ALG_MAP[jwkEntry.alg];
      if (algorithm === undefined) {
        return undefined;
      }
      const verified = verify(algorithm, Buffer.from(data), publicKey, Buffer.from(signature));
      if (!verified) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }

  const raw =
    payload.email !== undefined && payload.email !== ""
      ? payload.email
      : payload.preferred_username;
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return raw.trim().toLowerCase();
};

/** Decode an email string from a raw auth header value (JWT or plain string). */
const resolveEmail = (value: string): string | undefined => {
  if (JWT_REGEX.test(value)) {
    const email = resolveJwtEmail(value);
    if (email !== undefined) {
      return email;
    }
    // Fall through to plain string if JWT verification failed but
    // no JWKS is configured (backward compatibility).
    if (jwtKeys !== undefined) {
      return undefined; // JWKS configured but verification failed -- reject
    }
  }
  return value.trim().toLowerCase();
};

function makeUser(email: string): User {
  const displayName = emailToDisplayName(email);
  const editors = perms.editors ?? [];
  const canEdit = isReadonly ? false : editors.length === 0 || editors.includes(email);
  return { canEdit, displayName, email, id: email, name: displayName };
}

const parseUser = (headers: Headers, authHeader: string): User | undefined => {
  // Check the configured auth header first. If absent or empty, fall through
  // to the kumidocs_email cookie (used when no SSO proxy is present).
  const headerVal = headers.get(authHeader);
  const value =
    headerVal !== null && headerVal !== "" && headerVal.trim() !== ""
      ? headerVal
      : cookieEmail(headers.get("cookie"));
  if (value === undefined || value === "") {
    return undefined;
  }

  const email = resolveEmail(value);
  if (email === undefined || email === "") {
    return undefined;
  }

  return makeUser(email);
};

export type { KumiDocsPermissions };
export {
  getJwtKids,
  getReadonly,
  makeUser,
  parseUser,
  setJwtJwks,
  setPermissions,
  getPermissions,
  setReadonly,
};
