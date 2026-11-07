<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login } from "../api";

const route = useRoute();
const router = useRouter();
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await login(email.value.trim(), password.value);
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") && !route.query.redirect.startsWith("//") ? route.query.redirect : "/";
    router.replace(redirect);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="card-box shadow-sm" style="width: min(400px, 100%); padding: 32px">
    <div class="d-flex align-items-center gap-2 mb-4">
      <span class="brand-mark text-white"><Icon icon="mdi:account-tie" /></span>
      <span class="fs-5 fw-bold">HR Admin</span>
    </div>
    <h1 class="h4 fw-bold mb-1">Welcome back</h1>
    <p class="muted mb-4">Log in to manage employees, contracts and headcount.</p>
    <form @submit.prevent="submit">
      <div class="mb-3">
        <label class="form-label" for="email">Email</label>
        <input id="email" v-model="email" type="email" class="form-control" autocomplete="username" required autofocus />
      </div>
      <div class="mb-3">
        <label class="form-label" for="password">Password</label>
        <input id="password" v-model="password" type="password" class="form-control" autocomplete="current-password" required />
      </div>
      <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
      <button class="btn btn-primary w-100" :disabled="loading">
        <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>Log in
      </button>
    </form>
  </div>
</template>
