const STORAGE_KEY = "marvie:displayName";

export function getSavedName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // localStorage unavailable (private browsing etc.) — just skip remembering
  }
}
