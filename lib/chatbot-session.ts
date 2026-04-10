import { useSyncExternalStore } from "react";

export type ChatMessage = {
  id: string;
  from: "user" | "ai";
  text: string;
};

type ChatState = {
  messages: ChatMessage[];
};

const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    from: "ai",
    text: "Hello, I am GlobenTech AI Assistant. How can I help you today?",
  },
];

let state: ChatState = {
  messages: initialMessages,
};

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((fn) => fn());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

export function appendChatMessages(next: ChatMessage[]) {
  state = { messages: [...state.messages, ...next] };
  emit();
}

export function clearChatSession() {
  state = { messages: initialMessages };
  emit();
}

export function useChatSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
