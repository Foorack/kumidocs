import type { APIRequestContext } from "@playwright/test";

interface SearchHit {
  path: string;
  snippet: string;
  title: string;
}

const isSearchHit = (value: unknown): value is SearchHit =>
  typeof value === "object" &&
  value !== null &&
  "path" in value &&
  typeof value.path === "string" &&
  "snippet" in value &&
  typeof value.snippet === "string" &&
  "title" in value &&
  typeof value.title === "string";

/** Run a search through the API and return the hits, checked for shape. */
async function search(request: APIRequestContext, query: string): Promise<SearchHit[]> {
  const res = await request.get(`/api/search?q=${encodeURIComponent(query)}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body) || !body.every((item) => isSearchHit(item))) {
    throw new Error(`Unexpected search response: ${JSON.stringify(body)}`);
  }
  return body;
}

export default search;
