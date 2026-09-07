import {
  LOGIN_ACCOUNT_LOCK_MS,
  LOGIN_ACCOUNT_LOCK_THRESHOLD,
} from "./app-constants.ts";

export type LoginFailureState = {
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
};

export function isAccountLoginLocked(
  lockedUntil: Date | null | undefined,
  now = new Date(),
) {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function nextLoginFailure(
  state: LoginFailureState,
  now = new Date(),
) {
  const hasRecentFailure = Boolean(
    state.lastFailedLoginAt &&
      now.getTime() - state.lastFailedLoginAt.getTime() < LOGIN_ACCOUNT_LOCK_MS,
  );
  const failedLoginCount = hasRecentFailure
    ? state.failedLoginCount + 1
    : 1;
  const lockedUntil =
    failedLoginCount >= LOGIN_ACCOUNT_LOCK_THRESHOLD
      ? new Date(now.getTime() + LOGIN_ACCOUNT_LOCK_MS)
      : null;

  return { failedLoginCount, lockedUntil };
}

export function loginClientLabel(userAgent: string | null) {
  const value = userAgent ?? "";
  const browser = /Edg\//.test(value)
    ? "Microsoft Edge"
    : /Firefox\//.test(value)
      ? "Firefox"
      : /Chrome\//.test(value)
        ? "Google Chrome"
        : /Safari\//.test(value)
          ? "Safari"
          : "不明なブラウザ";
  const operatingSystem = /Windows NT/.test(value)
    ? "Windows"
    : /Android/.test(value)
      ? "Android"
      : /iPhone|iPad/.test(value)
        ? "iPhone / iPad"
        : /Mac OS X/.test(value)
          ? "macOS"
          : /Linux/.test(value)
            ? "Linux"
            : "不明なOS";

  return `${browser} / ${operatingSystem}`;
}
