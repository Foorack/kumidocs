import type { BacklinkEntry, CommitEntry, SearchResult, TreeNode } from "./types";
import type { PageTemplateMap } from "./page";
import type { SlideThemeMap } from "./slide";

// Error

class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  public constructor(status: number, body?: unknown) {
    super(`API error ${status.toString()}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Response types

interface MeResponse {
  id: string;
  email: string;
  name: string;
  displayName: string;
  canEdit: boolean;
  headSha?: string;
  instanceName?: string;
  mode?: "docs" | "board";
  autoSaveDelay?: number;
  sidebarDefaultDepth?: number;
  slideThemes?: SlideThemeMap;
  pageTemplates?: PageTemplateMap;
}

interface FileGetResponse {
  content: string;
  path: string;
  sha: string;
}

interface FileSaveResponse {
  sha: string;
  pushWarning?: boolean;
}

interface ImageEntry {
  filename: string;
  path: string;
  url: string;
  size: number;
  usedIn: string[];
}

interface DiffData {
  sha: string;
  message: string;
  author: string;
  date: string;
  unifiedDiff: string;
}

// Deduplicate in-flight GET requests.
// If multiple callers hit the same URL concurrently, only one fetch goes out.
const inflight = new Map<string, Promise<unknown>>();

async function doFetch<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // body may not be JSON; ignore parse error
    }
    throw new ApiError(res.status, body);
  }
  const data: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return data as TResponse;
}

async function request<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
  // Deduplicate only idempotent GET requests without custom init
  const isGet = init === undefined || init.method === undefined || init.method === "GET";
  if (isGet) {
    const pending = inflight.get(url);
    if (pending !== undefined) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return pending as Promise<TResponse>;
    }
    const promise = doFetch<TResponse>(url, init);
    inflight.set(url, promise);
    // Clean up cache when the request settles, regardless of success/failure
    void (async (): Promise<void> => {
      try {
        await promise;
      } finally {
        // Only remove if ours is still the cached entry (avoid clearing a newer request)
        if (inflight.get(url) === promise) {
          inflight.delete(url);
        }
      }
    })();
    return promise;
  }
  return doFetch<TResponse>(url, init);
}

// API functions

const getMe = async (): Promise<MeResponse> => request<MeResponse>("/api/me");

const getTree = async (): Promise<TreeNode[]> => request<TreeNode[]>("/api/tree");

const searchPages = async (query: string, mode: string): Promise<SearchResult[]> =>
  request<SearchResult[]>(
    `/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`,
  );

interface BoardTicketData {
  boardName: string;
  boardPrefix: string;
  boardSlug: string;
  columns: { color: string; default?: boolean; final?: boolean; id: string }[];
  tickets: Record<string, unknown>[];
}

const getAllTickets = async (boardSlug?: string): Promise<BoardTicketData[]> =>
  request<BoardTicketData[]>(
    `/api/boards/tickets${boardSlug === undefined ? "" : `?board=${encodeURIComponent(boardSlug)}`}`,
  );

const getFile = async (path: string): Promise<FileGetResponse> =>
  request<FileGetResponse>(`/api/file?path=${encodeURIComponent(path)}`);

const putFile = async (path: string, content: string): Promise<FileSaveResponse> =>
  request<FileSaveResponse>(`/api/file?path=${encodeURIComponent(path)}`, {
    body: JSON.stringify({ content }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

const createFile = async (path: string, content: string): Promise<FileSaveResponse> =>
  request<FileSaveResponse>("/api/file", {
    body: JSON.stringify({ content, path }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const deleteFile = async (path: string): Promise<void> => {
  await request<unknown>(`/api/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
};

const renameFile = async (from: string, to: string): Promise<void> => {
  await request<unknown>("/api/file/rename", {
    body: JSON.stringify({ from, to }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
};

const getFileHistory = async (path: string): Promise<CommitEntry[]> =>
  request<CommitEntry[]>(`/api/file/history?path=${encodeURIComponent(path)}`);

const getFileDiff = async (path: string, sha: string): Promise<DiffData> =>
  request<DiffData>(
    `/api/file/diff?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(sha)}`,
  );

const getImages = async (): Promise<ImageEntry[]> => request<ImageEntry[]>("/api/images");

const deleteImage = async (filename: string): Promise<void> => {
  await request<unknown>(`/api/images/${encodeURIComponent(filename)}`, { method: "DELETE" });
};

const getBacklinks = async (path: string): Promise<BacklinkEntry[]> =>
  request<BacklinkEntry[]>(`/api/backlinks?path=${encodeURIComponent(path)}`);

const uploadImage = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append("file", file);
  return request<{ url: string }>("/api/upload/image", { body: form, method: "POST" });
};

/** Set email via HttpOnly cookie (POST), returns user data on success. */
const setAuthEmail = async (email: string): Promise<MeResponse> =>
  request<MeResponse>("/api/auth/email", {
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

/** Duplicate a page file by appending `-copy` before the `.md` extension. */
const duplicatePage = async (path: string): Promise<{ newPath: string } | { error: string }> => {
  try {
    const data = await getFile(path);
    const newPath = `${path.replace(/\.md$/iu, "")}-copy.md`;
    await createFile(newPath, data.content);
    return { newPath };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 409) {
      return { error: "A copy already exists at that path" };
    }
    return { error: "Duplicate failed" };
  }
};

export type {
  BoardTicketData,
  DiffData,
  FileGetResponse,
  FileSaveResponse,
  ImageEntry,
  MeResponse,
};
export {
  ApiError,
  createFile,
  deleteFile,
  deleteImage,
  duplicatePage,
  getAllTickets,
  getBacklinks,
  getFile,
  getFileDiff,
  getFileHistory,
  getImages,
  getMe,
  getTree,
  putFile,
  renameFile,
  searchPages,
  setAuthEmail,
  uploadImage,
};
