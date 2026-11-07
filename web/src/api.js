// The only place the web app talks to the backend: a small client for the HR REST API.
import { reactive } from "vue";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "hr_admin_token";

export const session = reactive({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
});

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: "Can't reach the HR API. Check that it's running and VITE_API_URL is correct." });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && path !== "/auth/login") {
    logout();
    onUnauthorized();
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return p.length ? "?" + new URLSearchParams(p).toString() : "";
};

export async function login(email, password) {
  const data = await request("POST", "/auth/login", { email, password });
  session.token = data.token;
  session.user = data.user;
  localStorage.setItem(TOKEN_KEY, data.token);
  return data.user;
}

export function logout() {
  session.token = null;
  session.user = null;
  localStorage.removeItem(TOKEN_KEY);
}

export async function loadSession() {
  if (!session.token) return null;
  try {
    session.user = (await request("GET", "/auth/me")).user;
  } catch {
    logout();
  }
  return session.user;
}

export const api = {
  dashboard: () => request("GET", "/dashboard"),

  employees: (filters) => request("GET", "/employees" + qs(filters)),
  employee: (id) => request("GET", `/employees/${id}`),
  createEmployee: (data) => request("POST", "/employees", data),
  updateEmployee: (id, data) => request("PUT", `/employees/${id}`, data),
  deleteEmployee: (id) => request("DELETE", `/employees/${id}`),

  extendContract: (id, data) => request("POST", `/employees/${id}/contract/extend`, data),
  notRenewing: (id, data) => request("POST", `/employees/${id}/contract/not-renewing`, data),
  upcomingContracts: (days) => request("GET", "/contracts/upcoming" + qs({ days })),
  reminders: () => request("GET", "/contracts/reminders"),

  departments: () => request("GET", "/departments"),
  createDepartment: (data) => request("POST", "/departments", data),
  updateDepartment: (id, data) => request("PUT", `/departments/${id}`, data),
  deleteDepartment: (id) => request("DELETE", `/departments/${id}`),

  leave: (filters) => request("GET", "/leave" + qs(filters)),
  addLeave: (data) => request("POST", "/leave", data),
  deleteLeave: (id) => request("DELETE", `/leave/${id}`),

  settings: () => request("GET", "/settings"),
  saveSettings: (data) => request("PUT", "/settings", data),
  changePassword: (data) => request("POST", "/auth/password", data),
  users: () => request("GET", "/users"),
  createUser: (data) => request("POST", "/users", data),
  deleteUser: (id) => request("DELETE", `/users/${id}`),
};
