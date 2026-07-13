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

const setPermissions = (permissions: KumiDocsPermissions): void => {
  perms = permissions;
};

const getPermissions = (): KumiDocsPermissions => perms;

const setReadonly = (value: boolean): void => {
  isReadonly = value;
};

const getReadonly = (): boolean => isReadonly;

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

/** Regex matching a valid JWT (three base64url/base64 segments separated by dots).
 * Base64url uses [A-Za-z0-9_-] and may include '=' padding.
 * Notably does NOT contain '@', so dotted email local-parts
 * (e.g. "some.name@example.com") won't be mistaken for JWTs.
 * ALB OIDC identity/data headers use base64 with '=' padding,
 * so we allow optional '=' at the end of each segment. */
const JWT_REGEX = /^[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*$/u;

/** Decode an email string from a raw auth header value (JWT or plain string). Returns undefined if JWT has no email claim. */
const resolveEmail = (value: string): string | undefined => {
  if (JWT_REGEX.test(value)) {
    const [, payloadB64] = value.split(".");
    try {
      const base64 = (payloadB64 ?? "").replaceAll("-", "+").replaceAll("_", "/");
      // Base64url omits padding, but atob() requires length % 4 === 0.
      // Pad to a multiple of 4 so short payloads don't throw.
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = JSON.parse(atob(padded)) as JWTPayload;
      const raw =
        payload.email !== undefined && payload.email !== ""
          ? payload.email
          : payload.preferred_username;
      if (raw === undefined || raw === "") {
        return undefined;
      }
      return raw.trim().toLowerCase();
    } catch {
      // Malformed JWT payload: not a valid JSON. Treat as plain string.
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
export { getReadonly, makeUser, parseUser, setPermissions, getPermissions, setReadonly };
