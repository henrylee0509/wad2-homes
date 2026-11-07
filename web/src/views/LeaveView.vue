<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { toast } from "../toast";
import { date, LEAVE_TYPES, todayIso } from "../utils/format";

const route = useRoute();
const records = ref([]);
const employees = ref([]);
const year = ref(new Date().getFullYear());
const filterEmployee = ref(route.query.employee_id ? String(route.query.employee_id) : "");
const form = reactive({ employee_id: filterEmployee.value, leave_type: "annual", start_date: todayIso(), end_date: todayIso(), days: "", reason: "" });
const saving = ref(false);
const error = ref("");

async function load() {
  try {
    records.value = await api.leave({ year: year.value, employee_id: filterEmployee.value || undefined });
  } catch (e) {
    toast.error(e.message);
  }
}
onMounted(async () => {
  load();
  try { employees.value = await api.employees({ status: "active" }); } catch (e) { toast.error(e.message); }
});

const selected = computed(() => employees.value.find((e) => String(e.id) === String(form.employee_id)));
const autoDays = computed(() => {
  if (!form.start_date || !form.end_date || form.end_date < form.start_date) return 0;
  return Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000) + 1;
});

async function submit(allowNegative = false) {
  error.value = "";
  saving.value = true;
  try {
    await api.addLeave({ ...form, days: form.days === "" ? undefined : Number(form.days), allowNegative });
    toast.success("Leave recorded.");
    Object.assign(form, { days: "", reason: "" });
    load();
    employees.value = await api.employees({ status: "active" });
  } catch (e) {
    if (e.body?.code === "INSUFFICIENT_LEAVE" && window.confirm(`${e.message} Record it anyway?`)) return submit(true);
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove(r) {
  if (!window.confirm("Delete this leave record?")) return;
  try {
    await api.deleteLeave(r.id);
    load();
    employees.value = await api.employees({ status: "active" });
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <div class="row g-3">
    <div class="col-lg-4">
      <form class="card-box" @submit.prevent="submit()">
        <h2 class="section-title"><Icon icon="mdi:calendar-plus" /> Record leave</h2>
        <div class="mb-3">
          <label class="form-label">Employee *</label>
          <select v-model="form.employee_id" class="form-select" required>
            <option value="" disabled>Choose an employee</option>
            <option v-for="e in employees" :key="e.id" :value="String(e.id)">{{ e.full_name }}</option>
          </select>
          <div v-if="selected" class="form-text">{{ selected.leave_remaining }} of {{ selected.annual_leave_days }} annual leave days left this year.</div>
        </div>
        <div class="mb-3">
          <label class="form-label">Type</label>
          <select v-model="form.leave_type" class="form-select"><option v-for="(label, key) in LEAVE_TYPES" :key="key" :value="key">{{ label }}</option></select>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-6"><label class="form-label">From</label><input v-model="form.start_date" type="date" class="form-control" required /></div>
          <div class="col-6"><label class="form-label">To</label><input v-model="form.end_date" type="date" class="form-control" :min="form.start_date" required /></div>
        </div>
        <div class="mb-3">
          <label class="form-label">Days</label>
          <input v-model="form.days" type="number" min="0.5" step="0.5" class="form-control" :placeholder="`${autoDays} (calendar days)`" />
          <div class="form-text">Leave empty to count calendar days, or enter working days (half days allowed).</div>
        </div>
        <div class="mb-3"><label class="form-label">Reason</label><input v-model="form.reason" class="form-control" /></div>
        <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="saving || !form.employee_id">Save</button>
      </form>
    </div>

    <div class="col-lg-8">
      <div class="card-box">
        <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
          <h2 class="section-title mb-0"><Icon icon="mdi:format-list-bulleted" /> Leave records</h2>
          <div class="d-flex gap-2">
            <select v-model="filterEmployee" class="form-select form-select-sm w-auto" aria-label="Employee" @change="load">
              <option value="">Everyone</option>
              <option v-for="e in employees" :key="e.id" :value="String(e.id)">{{ e.full_name }}</option>
            </select>
            <select v-model="year" class="form-select form-select-sm w-auto" aria-label="Year" @change="load">
              <option v-for="y in [year + 1, year, year - 1, year - 2].filter((v, i, a) => a.indexOf(v) === i)" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
        </div>
        <div v-if="!records.length" class="empty small"><Icon icon="mdi:beach" class="icon" />No leave recorded for this period.</div>
        <div v-else class="table-responsive">
          <table class="table align-middle mb-0 small">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th class="text-end">Days</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in records" :key="r.id">
                <td><RouterLink :to="`/employees/${r.employee_id}`">{{ r.employee_name }}</RouterLink><div class="muted">{{ r.department_name }}</div></td>
                <td>{{ LEAVE_TYPES[r.leave_type] }}</td>
                <td>{{ date(r.start_date) }}<span v-if="r.end_date !== r.start_date"> – {{ date(r.end_date) }}</span></td>
                <td class="text-end">{{ r.days }}</td>
                <td>{{ r.reason || "–" }}</td>
                <td class="text-end"><button class="btn btn-sm btn-link text-danger p-0" aria-label="Delete leave record" @click="remove(r)"><Icon icon="mdi:delete-outline" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
