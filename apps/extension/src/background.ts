import { getChromeApi } from './chromeApi.js';

export type BackgroundMessage =
  | { type: 'SCHEDULE_CLIPBOARD_CLEAR'; delaySeconds?: number }
  | { type: 'SCHEDULE_AUTO_LOCK'; delayMinutes?: number }
  | {
      type: 'FORWARD_AUTOFILL_TO_TAB';
      tabId: number;
      username?: string;
      password: string;
    };

const ALARM_CLIPBOARD_CLEAR = 'obsidian-clipboard-clear';
const ALARM_AUTO_LOCK = 'obsidian-auto-lock';

const chromeApi = getChromeApi();

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const msg = rawMessage as BackgroundMessage | null;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'SCHEDULE_CLIPBOARD_CLEAR') {
      const minutes = Math.max(0.5, (msg.delaySeconds ?? 30) / 60);
      void chromeApi.alarms?.create(ALARM_CLIPBOARD_CLEAR, { delayInMinutes: minutes });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'SCHEDULE_AUTO_LOCK') {
      const minutes = Math.max(0.5, msg.delayMinutes ?? 2);
      void chromeApi.alarms?.create(ALARM_AUTO_LOCK, { delayInMinutes: minutes });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'FORWARD_AUTOFILL_TO_TAB') {
      if (chromeApi.tabs) {
        void chromeApi.tabs
          .sendMessage(msg.tabId, {
            type: 'OBSIDIAN_VAULT_FILL',
            username: msg.username,
            password: msg.password,
          })
          .then((res) => sendResponse(res ?? { ok: true }))
          .catch(() => sendResponse({ ok: false }));
        return true;
      }
    }
  });
}

if (chromeApi?.alarms?.onAlarm) {
  chromeApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_AUTO_LOCK) {
      void chromeApi.storage?.session?.remove(['unlockedAt']);
    }
  });
}
