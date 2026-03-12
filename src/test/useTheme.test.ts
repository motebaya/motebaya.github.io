import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light when no localStorage and no system preference", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads theme from localStorage", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggles from light to dark", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("toggles from dark to light", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("persists theme across toggles", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(localStorage.getItem("theme")).toBe("dark");

    act(() => result.current.toggleTheme());
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
