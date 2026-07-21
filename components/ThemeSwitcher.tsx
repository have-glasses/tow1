"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "tow1:theme";
const themes = [
  { id: "forest", name: "松绿", colors: ["#276b4e", "#dfece4"] },
  { id: "ocean", name: "海盐蓝", colors: ["#326a8c", "#deedf4"] },
  { id: "violet", name: "雾紫", colors: ["#6b5b91", "#ebe6f4"] },
  { id: "sand", name: "暖砂", colors: ["#9a633f", "#f2e7dc"] }
] as const;

type ThemeId = typeof themes[number]["id"];

function isTheme(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("forest");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) setTheme(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  function choose(nextTheme: ThemeId) {
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
    setOpen(false);
  }

  return (
    <div className="theme-switcher" ref={root}>
      <button className="theme-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="切换外观">
        <Palette size={17} /><span>外观</span>
      </button>
      {open ? <div className="theme-menu" role="menu" aria-label="选择配色">
        {themes.map((option) => <button type="button" role="menuitemradio" aria-checked={theme === option.id} key={option.id} onClick={() => choose(option.id)}>
          <span className="theme-swatches" aria-hidden="true"><i style={{ background: option.colors[0] }} /><i style={{ background: option.colors[1] }} /></span>
          <span>{option.name}</span>
          {theme === option.id ? <Check size={15} /> : null}
        </button>)}
      </div> : null}
    </div>
  );
}
