<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { api } from "../api";
import { toast } from "../toast";
import { money } from "../utils/format";
import HeadcountBar from "../components/HeadcountBar.vue";
import ModalDialog from "../components/ModalDialog.vue";

const departments = ref([]);
const people = ref([]);
const loading = ref(true);
const editing = ref(null); // null | {} (new) | department
const form = reactive({ name: "", code: "", headcount_limit: 0, head_employee_id: "" });
const saving = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  try {
    [departments.value, people.value] = await Promise.all([api.departments(), api.employees({ status: "active" })]);
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const totals = computed(() => ({
  filled: departments.value.reduce((s, d) => s + d.active_count, 0),
  approved: departments.value.reduce((s, d) => s + d.headcount_limit, 0),
  open: departments.value.reduce((s, d) => s + (d.vacancies || 0), 0),
  over: departments.value.reduce((s, d) => s + d.over_by, 0),
}));

function open(dept = null) {
  error.value = "";
  editing.value = dept || {};
  Object.assign(form, { name: dept?.name || "", code: dept?.code || "", headcount_limit: dept?.headcount_limit ?? 0, head_employee_id: dept?.head_employee_id || "" });
}

async function save() {
  saving.value = true;
  error.value = "";
  const payload = { ...form, headcount_limit: Number(form.headcount_limit), head_employee_id: form.head_employee_id || null };
  try {
    if (editing.value.id) await api.updateDepartment(editing.value.id, payload);
    else await api.createDepartment(payload);
    toast.success(editing.value.id ? "Department updated." : "Department added.");
    editing.value = null;
    load();
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function adjust(dept, delta) {
  const limit = Math.max(0, dept.headcount_limit + delta);
  try {
    const updated = await api.updateDepartment(dept.id, { name: dept.name, code: dept.code, head_employee_id: dept.head_employee_id, headcount_limit: limit });
    Object.assign(dept, updated);
  } catch (e) {
    toast.error(e.message);
  }
}

async function remove(dept) {
  if (!window.confirm(`Delete the ${dept.name} department?`)) return;
  try {
    await api.deleteDepartment(dept.id);
    toast.success("Department deleted.");
    load();
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <div class="row g-3 mb-3">
    <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Filled seats</div><div class="stat-value">{{ totals.filled }}</div></div></div>
    <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Approved headcount</div><div class="stat-value">{{ totals.approved }}</div></div></div>
    <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Open seats</div><div class="stat-value text-success">{{ totals.open }}</div></div></div>
    <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Over headcount</div><div class="stat-value" :class="{ 'text-danger': totals.over }">{{ totals.over }}</div></div></div>
  </div>

  <div class="d-flex justify-content-between align-items-center mb-3">
    <p class="muted mb-0 small">Set each department's approved headcount. Adding staff beyond it needs confirmation. 0 means no limit.</p>
    <button class="btn btn-primary" @click="open()"><Icon icon="mdi:plus" class="me-1" />Add department</button>
  </div>

  <div v-if="loading && !departments.length" class="empty"><span class="spinner-border text-primary"></span></div>
  <div v-else-if="!departments.length" class="empty card-box"><Icon icon="mdi:office-building-outline" class="icon" />No departments yet.</div>

  <div class="row g-3">
    <div v-for="d in departments" :key="d.id" class="col-md-6 col-xl-4">
      <div class="card-box h-100 d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h3 class="h6 fw-bold mb-0">{{ d.name }} <span v-if="d.code" class="muted fw-normal small">· {{ d.code }}</span></h3>
            <div class="small muted">Head: {{ d.head_name || "not set" }}</div>
          </div>
          <div class="dropdown">
            <button class="btn btn-sm btn-light" aria-label="Edit department" @click="open(d)"><Icon icon="mdi:pencil-outline" /></button>
          </div>
        </div>

        <HeadcountBar class="my-2" :filled="d.active_count" :limit="d.headcount_limit" />

        <div class="d-flex align-items-center gap-2 my-2">
          <span class="small muted">Approved</span>
          <div class="btn-group btn-group-sm" role="group" :aria-label="`Approved headcount for ${d.name}`">
            <button class="btn btn-outline-secondary" :disabled="d.headcount_limit <= 0" @click="adjust(d, -1)"><Icon icon="mdi:minus" /></button>
            <span class="btn btn-outline-secondary disabled fw-semibold" style="min-width: 44px">{{ d.headcount_limit }}</span>
            <button class="btn btn-outline-secondary" @click="adjust(d, 1)"><Icon icon="mdi:plus" /></button>
          </div>
        </div>

        <div class="small d-flex flex-wrap gap-3 mt-auto pt-2 border-top">
          <span><span class="muted">Payroll</span> {{ money(d.monthly_payroll) }}/mo</span>
          <span><span class="muted">Contracts ending (90d)</span> {{ d.contracts_ending_90d }}</span>
        </div>
        <div class="d-flex justify-content-between mt-2">
          <RouterLink :to="{ path: '/employees', query: { department_id: d.id } }" class="small">View staff</RouterLink>
          <button class="btn btn-link btn-sm text-danger p-0" @click="remove(d)">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <ModalDialog v-if="editing" :title="editing.id ? `Edit ${editing.name}` : 'Add department'" @close="editing = null">
    <form id="dept-form" @submit.prevent="save">
      <div class="mb-3"><label class="form-label">Name *</label><input v-model="form.name" class="form-control" required /></div>
      <div class="row g-3 mb-3">
        <div class="col-6"><label class="form-label">Code</label><input v-model="form.code" class="form-control" placeholder="e.g. ENG" /></div>
        <div class="col-6"><label class="form-label">Approved headcount</label><input v-model="form.headcount_limit" type="number" min="0" step="1" class="form-control" /></div>
      </div>
      <div class="mb-1">
        <label class="form-label">Department head</label>
        <select v-model="form.head_employee_id" class="form-select">
          <option value="">Not set</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.full_name }} · {{ p.job_title }}</option>
        </select>
        <div class="form-text">Gets contract reminders for staff who have no direct manager.</div>
      </div>
      <div v-if="error" class="alert alert-danger py-2 mt-3 mb-0">{{ error }}</div>
    </form>
    <template #footer>
      <button class="btn btn-light" @click="editing = null">Cancel</button>
      <button class="btn btn-primary" form="dept-form" :disabled="saving">Save</button>
    </template>
  </ModalDialog>
</template>
