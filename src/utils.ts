// eslint-disable-next-line
export type Platform = "web" | "ios" | "android" | "windows" | "macos" | "linux" | string;

export function platform<T, D>(options: Record<Platform, T>, fallback?: D): T | D {
  for (const key in options) {
    if (__PLATFORM__ === key) {
      return ((options[key] as T) ?? fallback) as T;
    }
  }

  return fallback as D;
}

export function mobile<T, D>(value: T, fallback?: D): T | D {
  return __IS_MOBILE__ ? value : (fallback as D);
}

export function desktop<T, D>(value: T, fallback?: D): T | D {
  return __IS_DESKTOP__ ? value : (fallback as D);
}

export function web<T, D>(value: T, fallback?: D): T | D {
  return platform({ web: value }, fallback);
}

export function ios<T, D>(value: T, fallback?: D): T | D {
  return platform({ ios: value }, fallback);
}

export function android<T, D>(value: T, fallback?: D): T | D {
  return platform({ android: value }, fallback);
}

export function windows<T, D>(value: T, fallback?: D): T | D {
  return platform({ windows: value }, fallback);
}

export function macos<T, D>(value: T, fallback?: D): T | D {
  return platform({ macos: value }, fallback);
}

export function linux<T, D>(value: T, fallback?: D): T | D {
  return platform({ linux: value }, fallback);
}

export function isPlatform(...platforms: Platform[]): boolean {
  return platforms.includes(__PLATFORM__);
}

export function isMobile(): boolean {
  return __IS_MOBILE__;
}

export function isDesktop(): boolean {
  return __IS_DESKTOP__;
}

export function isWeb(): boolean {
  return __PLATFORM__ === "web";
}

export function isIOS(): boolean {
  return __PLATFORM__ === "ios";
}

export function isAndroid(): boolean {
  return __PLATFORM__ === "android";
}

export function isWindows(): boolean {
  return __PLATFORM__ === "windows";
}

export function isMacOS(): boolean {
  return __PLATFORM__ === "macos";
}

export function isLinux(): boolean {
  return __PLATFORM__ === "linux";
}
