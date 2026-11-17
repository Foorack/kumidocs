/**
 * Every spec imports test and expect from here instead of @playwright/test.
 *
 * The auto fixture fails a test that collected a page error or a console
 * error. A React render error does not throw in the browser: the error
 * boundary catches it, logs it and shows a fallback, so the rest of the page
 * keeps working and a green test would still ship the bug.
 *
 * Only the page fixture is watched. A spec that calls browser.newContext()
 * gets pages this fixture never sees, so hand each of those pages to
 * watchPage() and assert on the result with expectNoPageErrors().
 */
import { expect, test as base } from "@playwright/test";
import type { ConsoleMessage, Page, TestInfo } from "@playwright/test";

interface PageErrors {
  messages: string[];
}

const MISSING_RESOURCE = "Failed to load resource: the server responded with a status of 404 ";

/**
 * Chromium writes a console error for every non-2xx response, even when the app
 * handles it. Asking for a page that does not exist is normal here: the viewer
 * requests it, gets a 404 and renders "Page not found". Every other failed
 * resource stays fatal, so a missing chunk or image still fails the test.
 */
const isHarmless = (message: ConsoleMessage): boolean =>
  message.text().startsWith(MISSING_RESOURCE) && message.location().url.includes("/api/file?path=");

/** Start collecting errors for one page. */
function watchPage(page: Page): PageErrors {
  const state: PageErrors = { messages: [] };
  page.on("pageerror", (error) => {
    state.messages.push(`uncaught: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    if (!isHarmless(message)) {
      state.messages.push(`console.error: ${message.text()}`);
    }
  });
  return state;
}

/** Fail the test if the page collected anything. Message says what to do next. */
function expectNoPageErrors(state: PageErrors, testInfo: TestInfo): void {
  if (state.messages.length === 0) {
    return;
  }
  expect(
    state.messages,
    `The browser logged errors during "${testInfo.title}". Fix the error, or filter it by exact text in e2e/support/test.ts when it is harmless.`,
  ).toEqual([]);
}

const test = base.extend<{ pageErrors: PageErrors }>({
  pageErrors: [
    async ({ page }, use, testInfo): Promise<void> => {
      const state = watchPage(page);
      await use(state);
      expectNoPageErrors(state, testInfo);
    },
    { auto: true },
  ],
});

export { expect, expectNoPageErrors, test, watchPage };
