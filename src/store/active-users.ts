import { useSyncExternalStore } from "react";

/** Module-level set of active user emails, populated from WebSocket presence updates. */
let activeEmails = new Set<string>();

const subscribers = new Set<() => void>();

const notify = (): void => {
  for (const fn of subscribers) {
    fn();
  }
};

/** Replace the active set with a fresh set of emails aggregated from all pages. */
const setActiveUsers = (emails: Set<string>): void => {
  activeEmails = emails;
  notify();
};

/** React hook: returns the set of currently active user emails. */
const useActiveUsers = (): Set<string> =>
  useSyncExternalStore(
    // oxlint-disable-next-line promise/prefer-await-to-callbacks
    (cb) => {
      subscribers.add(cb);
      return (): void => {
        subscribers.delete(cb);
      };
    },
    () => activeEmails,
  );

export { setActiveUsers, useActiveUsers };
