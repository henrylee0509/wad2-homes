// Tiny toast notifications shared across the app
import { reactive } from "vue";

export const toasts = reactive([]);
let nextId = 1;

function push(type, message, ms = 4000) {
  const id = nextId++;
  toasts.push({ id, type, message });
  setTimeout(() => dismiss(id), ms);
}
export function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export const toast = {
  success: (m) => push("success", m),
  error: (m) => push("danger", m, 6000),
  info: (m) => push("info", m),
};
