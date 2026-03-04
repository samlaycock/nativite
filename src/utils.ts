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

export function web<T, D>(value: T, fallback?: D): T | D {
  return platform({ web: value }, fallback);
}

export function mobile<T, D>(value: T, fallback?: D): T | D {
  return platform({ ios: value, android: value }, fallback);
}

export function desktop<T, D>(value: T, fallback?: D): T | D {
  return platform({ windows: value, macos: value, linux: value }, fallback);
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
