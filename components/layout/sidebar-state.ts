"use client";

import { useSyncExternalStore } from "react";

/** Menu recolhido (só ícones) no computador — guardado neste navegador. */
const KEY = "vsplanner:sidebar-collapsed";
const EVENT = "vsplanner:sidebar-collapsed";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function setSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* modo privado: só nesta sessão */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
