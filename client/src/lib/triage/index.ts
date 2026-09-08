/** The triage registry. */
import type { Message } from "./types";
import { INBOX_ONE } from "./data/inbox-one";

export const MESSAGES: Message[] = INBOX_ONE;

export const getMessage = (id: string): Message | undefined =>
  MESSAGES.find((message) => message.id === id);

export * from "./types";
export * from "./signals";
