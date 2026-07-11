import type { TicketData } from "./board";
import { emailToDisplayName } from "./avatar";

interface ScrapeResult {
  /** Map from email to a human-readable display name derived via emailToDisplayName. */
  displayNames: Map<string, string>;
  /** Sorted, deduplicated list of all email addresses found across all tickets. */
  emails: string[];
}

/**
 * Scan all tickets for email addresses in reporter, assignee, bookmarks,
 * timeline entries, comments, and approvals. Deduplicates and sorts the
 * result alphabetically.
 *
 * Also returns a Map<email, displayName> so callers can show readable names.
 */
function scrapeUsers(tickets: TicketData[]): ScrapeResult {
  const seen = new Set<string>();
  const displayNames = new Map<string, string>();

  function addEmail(email: string): void {
    if (email === "" || seen.has(email)) {
      return;
    }
    seen.add(email);
    displayNames.set(email, emailToDisplayName(email));
  }

  for (const ticket of tickets) {
    if (ticket.reporter !== undefined && ticket.reporter !== "") {
      addEmail(ticket.reporter);
    }
    if (ticket.assignee !== undefined && ticket.assignee !== "") {
      addEmail(ticket.assignee);
    }
    if (ticket.bookmarks !== undefined) {
      for (const bm of ticket.bookmarks) {
        addEmail(bm);
      }
    }
    if (ticket.timeline !== undefined) {
      for (const entry of ticket.timeline) {
        addEmail(entry.user);
      }
    }
    if (ticket.comments !== undefined) {
      for (const comment of ticket.comments) {
        addEmail(comment.user);
      }
    }
    if (ticket.approvals !== undefined) {
      for (const approval of ticket.approvals) {
        addEmail(approval.user);
      }
    }
  }

  const emails = [...seen].toSorted((emailA, emailB) =>
    emailA.toLowerCase().localeCompare(emailB.toLowerCase()),
  );

  return { displayNames, emails };
}

export { scrapeUsers };
export type { ScrapeResult };
