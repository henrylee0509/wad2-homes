<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api";
import { money, date, initials, contractLabel, contractClass, statusClass, EMPLOYMENT_TYPES, STATUSES } from "../utils/format";

const router = useRouter();
const route = useRoute();
const employees = ref([]);
const departments = ref([]);
const loading = ref(true);
const error = ref("");
const showSalary = ref(false);
const filters = reactive({
  search: route.query.search || "",
  department_id: route.query.department_id || "",
  status: route.query.status ?? "active",
  employment_type: route.query.employment_type || "",
});
const sort = reactive({ key: "full_name", dir: 1 });

async function load() {
  loading.value = true;
  error.value = "";
  try {
    employees.value = await api.employees(filters);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

let timer;
watch(filters, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    router.replace({ query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")) });
    load();
  }, 250);
});

onMounted(async () => {
  load();
  try { departments.value = await api.departments(); } catch { /* filter list is optional */ }
});

const sorted = computed(() => {
  const k = sort.key;
  return [...employees.value].sort((a, b) => {
    const x = a[k] ?? "", y = b[k] ?? "";
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
  });
});
function sortBy(key) {
  if (sort.key === key) sort.dir *= -1;
  else { sort.key = key; sort.dir = 1; }
}
const arrow = (key) => (sort.key === key ? (sort.dir === 1 ? "mdi:chevron-up" : "mdi:chevron-down") : null);

function exportCsv() {
  const cols = [
    ["employee_no", "Employee no"], ["full_name", "Name"], ["age", "Age"], ["department_name", "Department"], ["job_title", "Job title"],
    ["employment_type", "Type"], ["status", "Status"], ["email", "Email"], ["phone", "Phone"], ["address", "Address"],
    ["start_date", "Start date"], ["contract_end_date", "Contract end"], ["salary", "Monthly salary (SGD)"], ["leave_remaining", "Annual leave left"],
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map((c) => esc(c[1])).join(","), ...sorted.value.map((e) => cols.map((c) => esc(e[c[0]])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
    <div class="input-group" style="max-width: 320px">
      <span class="input-group-text bg-white"><Icon icon="mdi:magnify" /></span>
      <input v-model="filters.search" type="search" class="form-control" placeholder="Search name, ID, email, role" aria-label="Search employees" />
    </div>
    <select v-model="filters.department_id" class="form-select w-auto" aria-label="Department">
      <option value="">All departments</option>
      <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
    </select>
    <select v-model="filters.employment_type" class="form-select w-auto" aria-label="Employment type">
      <option value="">All types</option>
      <option v-for="(label, key) in EMPLOYMENT_TYPES" :key="key" :value="key">{{ label }}</option>
    </select>
    <select v-model="filters.status" class="form-select w-auto" aria-label="Status">
      <option value="">All statuses</option>
      <option v-for="(label, key) in STATUSES" :key="key" :value="key">{{ label }}</option>
    </select>
    <div class="ms-auto d-flex gap-2">
      <button class="btn btn-light border" @click="showSalary = !showSalary">
        <Icon :icon="showSalary ? 'mdi:eye-off-outline' : 'mdi:eye-outline'" class="me-1" />{{ showSalary ? "Hide" : "Show" }} salaries
      </button>
      <button class="btn btn-light border" :disabled="!employees.length" @click="exportCsv"><Icon icon="mdi:download" class="me-1" />CSV</button>
      <RouterLink to="/employees/new" class="btn btn-primary"><Icon icon="mdi:plus" class="me-1" />Add employee</RouterLink>
    </div>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div class="table-card">
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead>
          <tr>
            <th role="button" @click="sortBy('full_name')">Employee <Icon v-if="arrow('full_name')" :icon="arrow('full_name')" /></th>
            <th role="button" @click="sortBy('department_name')">Department <Icon v-if="arrow('department_name')" :icon="arrow('department_name')" /></th>
            <th role="button" @click="sortBy('age')">Age <Icon v-if="arrow('age')" :icon="arrow('age')" /></th>
            <th>Contact</th>
            <th role="button" @click="sortBy('contract_end_date')">Contract <Icon v-if="arrow('contract_end_date')" :icon="arrow('contract_end_date')" /></th>
            <th role="button" class="text-end" @click="sortBy('leave_remaining')">Leave left <Icon v-if="arrow('leave_remaining')" :icon="arrow('leave_remaining')" /></th>
            <th role="button" class="text-end" @click="sortBy('salary')">Salary <Icon v-if="arrow('salary')" :icon="arrow('salary')" /></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sorted" :key="e.id" class="row-link" @click="router.push(`/employees/${e.id}`)">
            <td>
              <div class="d-flex align-items-center gap-2">
                <span class="avatar">{{ initials(e.full_name) }}</span>
                <div>
                  <div class="fw-semibold">{{ e.full_name }}</div>
                  <div class="small muted">{{ e.employee_no }} · {{ e.job_title || "–" }}</div>
                </div>
              </div>
            </td>
            <td>{{ e.department_name || "–" }}</td>
            <td>{{ e.age ?? "–" }}</td>
            <td class="small">
              <div>{{ e.email || "–" }}</div>
              <div class="muted">{{ e.phone }}</div>
            </td>
            <td>
              <span v-if="e.status !== 'active'" class="badge-soft" :class="statusClass(e.status)">{{ STATUSES[e.status] }}</span>
              <template v-else-if="e.contract_end_date">
                <div class="small">{{ date(e.contract_end_date) }}</div>
                <span class="badge-soft" :class="contractClass(e.days_to_contract_end)">{{ contractLabel(e.days_to_contract_end) }}</span>
              </template>
              <span v-else class="badge-soft info">{{ EMPLOYMENT_TYPES[e.employment_type] }}</span>
            </td>
            <td class="text-end">{{ e.leave_remaining }} <span class="small muted">/ {{ e.annual_leave_days }}</span></td>
            <td class="text-end">{{ showSalary ? money(e.salary) : "••••" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="loading && !employees.length" class="empty"><span class="spinner-border text-primary"></span></div>
    <div v-else-if="!employees.length" class="empty"><Icon icon="mdi:account-search-outline" class="icon" />No employees match these filters.</div>
  </div>
  <div class="small muted mt-2">{{ employees.length }} employee{{ employees.length === 1 ? "" : "s" }}</div>
</template>
