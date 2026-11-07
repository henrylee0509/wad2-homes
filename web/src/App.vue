<script setup>
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { session, logout } from "./api";
import { toasts, dismiss } from "./toast";

const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);

const nav = [
  { to: "/", label: "Dashboard", icon: "mdi:view-dashboard-outline" },
  { to: "/employees", label: "Employees", icon: "mdi:account-group-outline" },
  { to: "/departments", label: "Departments & headcount", icon: "mdi:office-building-outline" },
  { to: "/contracts", label: "Contracts", icon: "mdi:file-document-edit-outline" },
  { to: "/leave", label: "Leave", icon: "mdi:calendar-blank-outline" },
  { to: "/settings", label: "Settings", icon: "mdi:cog-outline" },
];

const isActive = (to) => (to === "/" ? route.path === "/" : route.path.startsWith(to));

function signOut() {
  logout();
  router.push({ name: "login" });
}

watch(() => route.fullPath, () => (menuOpen.value = false));
</script>

<template>
  <div v-if="route.meta.public" class="public-page">
    <RouterView />
  </div>

  <div v-else class="shell">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="brand">
        <span class="brand-mark"><Icon icon="mdi:account-tie" /></span>
        <span>HR Admin</span>
      </div>
      <nav>
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" class="nav-link-item" :class="{ active: isActive(item.to) }">
          <Icon :icon="item.icon" class="nav-icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <div class="small text-white-50 text-truncate">{{ session.user?.email }}</div>
        <button class="btn btn-sm btn-outline-light mt-2 w-100" @click="signOut">
          <Icon icon="mdi:logout" class="me-1" /> Log out
        </button>
      </div>
    </aside>
    <div v-if="menuOpen" class="backdrop" @click="menuOpen = false"></div>

    <div class="main">
      <header class="topbar">
        <button class="btn btn-light d-lg-none" aria-label="Open menu" @click="menuOpen = true">
          <Icon icon="mdi:menu" />
        </button>
        <h1 class="page-title">{{ route.meta.title }}</h1>
      </header>
      <main class="content">
        <RouterView :key="route.fullPath" />
      </main>
    </div>
  </div>

  <div class="toast-stack" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="alert shadow-sm d-flex align-items-start gap-2 mb-2" :class="`alert-${t.type}`">
      <span class="flex-grow-1">{{ t.message }}</span>
      <button type="button" class="btn-close btn-sm" aria-label="Dismiss" @click="dismiss(t.id)"></button>
    </div>
  </div>
</template>
