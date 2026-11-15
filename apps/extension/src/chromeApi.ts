export interface ChromeTab {
  id?: number;
  url?: string;
}

export interface ChromeAlarm {
  name: string;
}

export interface ChromeRuntimeMessageSender {
  tab?: ChromeTab;
}

export interface ChromeExtensionGlobal {
  tabs?: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<ChromeTab[]>;
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  };
  runtime?: {
    sendMessage: (message: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (
        cb: (
          message: unknown,
          sender: ChromeRuntimeMessageSender,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ) => void;
    };
  };
  alarms?: {
    create: (name: string, alarmInfo: { delayInMinutes: number }) => Promise<void> | void;
    clear: (name: string) => Promise<boolean> | void;
    onAlarm: {
      addListener: (cb: (alarm: ChromeAlarm) => void) => void;
    };
  };
  storage?: {
    session?: {
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
    };
  };
}

export function getChromeApi(): ChromeExtensionGlobal | null {
  const candidate = (globalThis as { chrome?: ChromeExtensionGlobal }).chrome;
  return candidate ?? null;
}
