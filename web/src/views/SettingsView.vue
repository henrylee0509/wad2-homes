<script setup>
import { ref, reactive, onMounted } from "vue";
import { api, session } from "../api";
import { toast } from "../toast";

const settings = reactive({ company_name: "", reminder_days_before: 30, hr_email: "", app_url: "" });
const users = ref([]);
const pw = reactive({ current_password: "", new_password: "" });
const newUser = reactive({ name: "", email: "", password: "" });
const savingSettings = ref(false);

onMounted(async () => {
  try {
    Object.assign(settings, await api.settings());
    users.value = await api.users();
  } catch (e) {
    toast.error(e.message);
  }
});

async function saveSettings() {
  savingSettings.value = true;
  try {
    Object.assign(settings, await api.saveSettings({ ...settings, reminder_days_before: Number(settings.reminder_days_before) }));
    toast.success("Settings saved.");
  } catch (e) {
    toast.error(e.message);
  } finally {
    savingSettings.value = false;
  }
}

async function changePassword() {
  try {
    await api.changePassword(pw);
    Object.assign(pw, { current_password: "", new_password: "" });
    toast.success("Password changed.");
  } catch (e) {
    toast.error(e.message);
  }
}

async function addUser() {
  try {
    users.value.push(await api.createUser(newUser));
    Object.assign(newUser, { name: "", email: "", password: "" });
    toast.success("Admin account added.");
  } catch (e) {
    toast.error(e.message);
  }
}

async function removeUser(u) {
  if (!window.confirm(`Remove ${u.email}'s access?`)) return;
  try {
    await api.deleteUser(u.id);
    users.value = users.value.filter((x) => x.id !== u.id);
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <div class="row g-3" style="max-width: 1100px">
    <div class="col-lg-6">
      <form class="card-box" @submit.prevent="saveSettings">
        <h2 class="section-title"><Icon icon="mdi:email-fast-outline" /> Contract reminders</h2>
        <div class="mb-3">
          <label class="form-label">Send the reminder this many days before a contract ends</label>
          <div class="input-group" style="max-width: 220px">
            <input v-model="settings.reminder_days_before" type="number" min="1" max="365" class="form-control" />
            <span class="input-group-text">days</span>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">HR email (fallback)</label>
          <input v-model="settings.hr_email" type="email" class="form-control" placeholder="hr@yourcompany.com" />
          <div class="form-text">Used when an employee has no manager and their department has no head.</div>
        </div>
        <div class="mb-3">
          <label class="form-label">Company name</label>
          <input v-model="settings.company_name" class="form-control" />
          <div class="form-text">Shown in reminder emails.</div>
        </div>
        <div class="mb-3">
          <label class="form-label">Web app address</label>
          <input v-model="settings.app_url" type="url" class="form-control" placeholder="https://hr.yourcompany.com" />
          <div class="form-text">Used for the "Review contract" link in emails (the API's WEB_URL setting takes priority).</div>
        </div>
        <button class="btn btn-primary" :disabled="savingSettings">Save settings</button>
      </form>
    </div>

    <div class="col-lg-6">
      <div class="card-box">
        <h2 class="section-title"><Icon icon="mdi:shield-account-outline" /> Admin accounts</h2>
        <ul class="list-unstyled mb-3">
          <li v-for="u in users" :key="u.id" class="d-flex justify-content-between align-items-center py-2 border-bottom">
            <div><div class="fw-semibold">{{ u.name }}</div><div class="small muted">{{ u.email }}</div></div>
            <span v-if="u.id === session.user?.id" class="badge-soft info">You</span>
            <button v-else class="btn btn-sm btn-link text-danger" @click="removeUser(u)">Remove</button>
          </li>
        </ul>
        <form class="row g-2" @submit.prevent="addUser">
          <div class="col-md-6"><input v-model="newUser.name" class="form-control form-control-sm" placeholder="Name" required /></div>
          <div class="col-md-6"><input v-model="newUser.email" type="email" class="form-control form-control-sm" placeholder="Email" required /></div>
          <div class="col-md-8"><input v-model="newUser.password" type="password" minlength="8" class="form-control form-control-sm" placeholder="Password (8+ characters)" required /></div>
          <div class="col-md-4"><button class="btn btn-sm btn-outline-primary w-100">Add admin</button></div>
        </form>
      </div>

      <form class="card-box" @submit.prevent="changePassword">
        <h2 class="section-title"><Icon icon="mdi:lock-outline" /> Change your password</h2>
        <div class="mb-2"><input v-model="pw.current_password" type="password" class="form-control" placeholder="Current password" autocomplete="current-password" required /></div>
        <div class="mb-3"><input v-model="pw.new_password" type="password" minlength="8" class="form-control" placeholder="New password (8+ characters)" autocomplete="new-password" required /></div>
        <button class="btn btn-outline-primary">Change password</button>
      </form>
    </div>
  </div>
</template>
