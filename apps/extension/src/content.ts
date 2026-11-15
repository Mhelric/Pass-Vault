import { getChromeApi } from './chromeApi.js';

export interface AutofillPayload {
  type: 'OBSIDIAN_VAULT_FILL';
  username?: string;
  password?: string;
}

function isVisibleInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  const style = window.getComputedStyle(input);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const prevShadow = input.style.boxShadow;
  input.style.boxShadow = '0 0 0 2px #8B5CF6';
  window.setTimeout(() => {
    input.style.boxShadow = prevShadow;
  }, 1200);
}

function fillActiveLoginForm(username?: string, password?: string): boolean {
  const passwordInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).filter(isVisibleInput);

  const primaryPassword = passwordInputs[0];
  let filledAny = false;

  if (primaryPassword && password) {
    setNativeInputValue(primaryPassword, password);
    filledAny = true;
  }

  if (username) {
    const scopeRoot: ParentNode = primaryPassword?.form ?? document;
    const candidateUsers = Array.from(
      scopeRoot.querySelectorAll<HTMLInputElement>(
        'input[type="email"], input[type="text"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[name*="login" i]'
      )
    ).filter((el) => isVisibleInput(el) && el !== primaryPassword);

    const userInput = candidateUsers[0];
    if (userInput) {
      setNativeInputValue(userInput, username);
      filledAny = true;
    }
  }

  return filledAny;
}

const chromeApi = getChromeApi();

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const msg = rawMessage as AutofillPayload | null;
    if (!msg || msg.type !== 'OBSIDIAN_VAULT_FILL') return;

    const filled = fillActiveLoginForm(msg.username, msg.password);
    sendResponse({ ok: filled });
  });
}
