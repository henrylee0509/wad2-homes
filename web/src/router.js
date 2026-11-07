import { createRouter, createWebHistory } from "vue-router";
import { session, loadSession, setUnauthorizedHandler } from "./api";

const routes = [
  { path: "/login", name: "login", component: () => import("./views/LoginView.vue"), meta: { public: true, title: "Log in" } },
  { path: "/", name: "dashboard", component: () => import("./views/DashboardView.vue"), meta: { title: "Dashboard" } },
  { path: "/employees", name: "employees", component: () => import("./views/EmployeesView.vue"), meta: { title: "Employees" } },
  { path: "/employees/new", name: "employee-new", component: () => import("./views/EmployeeEditView.vue"), meta: { title: "Add employee" } },
  { path: "/employees/:id", name: "employee", component: () => import("./views/EmployeeDetailView.vue"), meta: { title: "Employee" } },
  { path: "/employees/:id/edit", name: "employee-edit", component: () => import("./views/EmployeeEditView.vue"), meta: { title: "Edit employee" } },
  { path: "/departments", name: "departments", component: () => import("./views/DepartmentsView.vue"), meta: { title: "Departments & headcount" } },
  { path: "/contracts", name: "contracts", component: () => import("./views/ContractsView.vue"), meta: { title: "Contracts" } },
  { path: "/leave", name: "leave", component: () => import("./views/LeaveView.vue"), meta: { title: "Leave" } },
  { path: "/settings", name: "settings", component: () => import("./views/SettingsView.vue"), meta: { title: "Settings" } },
  { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("./views/NotFoundView.vue"), meta: { title: "Not found" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

let sessionChecked = false;
router.beforeEach(async (to) => {
  if (!sessionChecked) {
    await loadSession();
    sessionChecked = true;
  }
  const loggedIn = Boolean(session.token && session.user);
  if (!to.meta.public && !loggedIn) return { name: "login", query: to.fullPath !== "/" ? { redirect: to.fullPath } : {} };
  if (to.name === "login" && loggedIn) return { name: "dashboard" };
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · HR Admin` : "HR Admin";
});

setUnauthorizedHandler(() => {
  const current = router.currentRoute.value;
  if (!current.meta.public) router.push({ name: "login", query: { redirect: current.fullPath } });
});

export default router;
