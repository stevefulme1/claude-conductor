import { useState, useEffect, useCallback } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "conductor-theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", resolved);
}

export function useTheme() {
  const [preference, setPreference] = useState<Theme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "system";
  });

  const resolved = preference === "system" ? getSystemTheme() : preference;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const setTheme = useCallback((theme: Theme) => {
    setPreference(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, []);

  return { theme: preference, resolved, setTheme };
}
