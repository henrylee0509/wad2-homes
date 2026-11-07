<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { toast } from "../toast";
import { EMPLOYMENT_TYPES, STATUSES } from "../utils/format";
import ModalDialog from "../components/ModalDialog.vue";

const route = useRoute();
const router = useRouter();
const isNew = computed(() => !route.params.id);

const blank = {
  employee_no: "", first_name: "", last_name: "", date_of_birth: "", gender: "", email: "", phone: "", address: "",
  emergency_contact_name: "", emergency_contact_phone: "", department_id: "", job_title: "", manager_id: "",
  employment_type: "permanent", start_date: new Date().toISOString().slice(0, 10), contract_end_date: "", salary: "",
  annual_leave_days: 14, status: "active", notes: "",
};
const form = reactive({ ...blank });
const departments = ref([]);
const people = ref([]);
const loading = ref(true);
const saving = ref(false);
const errors = ref([]);
const headcountWarning = ref(null);

onMounted(async () => {
  try {
    const [depts, emps] = await Promise.all([api.departments(), api.employees({ status: "active" })]);
    departments.value = depts;
    people.value = emps;
    if (!isNew.value) {
      const e = await api.employee(route.params.id);
      for (const k of Object.keys(blank)) form[k] = e[k] ?? "";
    } else {
      const nums = emps.map((e) => Number(String(e.employee_no).replace(/\D/g, ""))).filter(Boolean);
      form.employee_no = `E${nums.length ? Math.max(...nums) + 1 : 1001}`;
    }
  } catch (e) {
    errors.value = [e.message];
  } finally {
    loading.value = false;
  }
});

const managers = computed(() => people.value.filter((p) => String(p.id) !== String(route.params.id)));
const selectedDept = computed(() => departments.value.find((d) => String(d.id) === String(form.department_id)));
const needsEndDate = computed(() => form.employment_type !== "permanent");

async function save(override = false) {
  errors.value = [];
  saving.value = true;
  const payload = { ...form, override_headcount: override };
  for (const k of ["department_id", "manager_id"]) payload[k] = payload[k] === "" ? null : Number(payload[k]);
  if (form.employment_type === "permanent") payload.contract_end_date = null;
  try {
    const saved = isNew.value ? await api.createEmployee(payload) : await api.updateEmployee(route.params.id, payload);
    toast.success(isNew.value ? `${saved.full_name} added.` : "Changes saved.");
    router.push(`/employees/${saved.id}`);
  } catch (e) {
    if (e.body?.code === "HEADCOUNT_FULL") headcountWarning.value = e.body;
    else errors.value = e.body?.errors || [e.message];
  } finally {
    saving.value = false;
  }
}

function confirmOverHeadcount() {
  headcountWarning.value = null;
  save(true);
}
</script>

<template>
  <div v-if="loading" class="empty"><span class="spinner-border text-primary"></span></div>
  <form v-else class="card-box" style="max-width: 980px" novalidate @submit.prevent="save()">
    <div v-if="errors.length" class="alert alert-danger">
      <div v-for="(err, i) in errors" :key="i">{{ err }}</div>
    </div>

    <h2 class="section-title"><Icon icon="mdi:account-outline" /> Personal details</h2>
    <div class="row g-3 mb-4">
      <div class="col-md-4"><label class="form-label">First name *</label><input v-model="form.first_name" class="form-control" required /></div>
      <div class="col-md-4"><label class="form-label">Last name *</label><input v-model="form.last_name" class="form-control" required /></div>
      <div class="col-md-4"><label class="form-label">Employee no. *</label><input v-model="form.employee_no" class="form-control" required /></div>
      <div class="col-md-4"><label class="form-label">Date of birth</label><input v-model="form.date_of_birth" type="date" class="form-control" /></div>
      <div class="col-md-4">
        <label class="form-label">Gender</label>
        <select v-model="form.gender" class="form-select"><option value="">–</option><option value="F">Female</option><option value="M">Male</option><option value="Other">Other</option></select>
      </div>
      <div class="col-12"><label class="form-label">Address</label><textarea v-model="form.address" class="form-control" rows="2"></textarea></div>
    </div>

    <h2 class="section-title"><Icon icon="mdi:phone-outline" /> Contact</h2>
    <div class="row g-3 mb-4">
      <div class="col-md-6"><label class="form-label">Email</label><input v-model="form.email" type="email" class="form-control" /></div>
      <div class="col-md-6"><label class="form-label">Phone</label><input v-model="form.phone" type="tel" class="form-control" /></div>
      <div class="col-md-6"><label class="form-label">Emergency contact name</label><input v-model="form.emergency_contact_name" class="form-control" /></div>
      <div class="col-md-6"><label class="form-label">Emergency contact phone</label><input v-model="form.emergency_contact_phone" type="tel" class="form-control" /></div>
    </div>

    <h2 class="section-title"><Icon icon="mdi:briefcase-outline" /> Employment</h2>
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <label class="form-label">Department</label>
        <select v-model="form.department_id" class="form-select">
          <option value="">No department</option>
          <option v-for="d in departments" :key="d.id" :value="d.id">
            {{ d.name }}{{ d.headcount_limit ? ` (${d.active_count}/${d.headcount_limit})` : "" }}
          </option>
        </select>
        <div v-if="selectedDept && selectedDept.headcount_limit && selectedDept.active_count >= selectedDept.headcount_limit" class="form-text text-warning">
          This department is at its approved headcount.
        </div>
      </div>
      <div class="col-md-6"><label class="form-label">Job title</label><input v-model="form.job_title" class="form-control" /></div>
      <div class="col-md-6">
        <label class="form-label">Manager</label>
        <select v-model="form.manager_id" class="form-select">
          <option value="">No manager</option>
          <option v-for="p in managers" :key="p.id" :value="p.id">{{ p.full_name }} · {{ p.job_title }}</option>
        </select>
        <div class="form-text">Contract reminders go to this person's email (or the department head if empty).</div>
      </div>
      <div class="col-md-6">
        <label class="form-label">Status</label>
        <select v-model="form.status" class="form-select"><option v-for="(label, key) in STATUSES" :key="key" :value="key">{{ label }}</option></select>
      </div>
      <div class="col-md-4">
        <label class="form-label">Employment type</label>
        <select v-model="form.employment_type" class="form-select"><option v-for="(label, key) in EMPLOYMENT_TYPES" :key="key" :value="key">{{ label }}</option></select>
      </div>
      <div class="col-md-4"><label class="form-label">Start date</label><input v-model="form.start_date" type="date" class="form-control" /></div>
      <div v-if="needsEndDate" class="col-md-4">
        <label class="form-label">Contract end date{{ form.employment_type === "contract" ? " *" : "" }}</label>
        <input v-model="form.contract_end_date" type="date" class="form-control" :min="form.start_date || undefined" />
      </div>
      <div class="col-md-4">
        <label class="form-label">Monthly salary (SGD)</label>
        <div class="input-group"><span class="input-group-text">$</span><input v-model="form.salary" type="number" min="0" step="50" class="form-control" /></div>
      </div>
      <div class="col-md-4">
        <label class="form-label">Annual leave (days per year)</label>
        <input v-model="form.annual_leave_days" type="number" min="0" step="0.5" class="form-control" />
      </div>
      <div class="col-12"><label class="form-label">Notes</label><textarea v-model="form.notes" class="form-control" rows="2"></textarea></div>
    </div>

    <div class="d-flex justify-content-end gap-2">
      <button type="button" class="btn btn-light" @click="router.back()">Cancel</button>
      <button class="btn btn-primary" :disabled="saving">
        <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>{{ isNew ? "Add employee" : "Save changes" }}
      </button>
    </div>
  </form>

  <ModalDialog v-if="headcountWarning" title="Department is full" @close="headcountWarning = null">
    <p class="mb-2">{{ headcountWarning.error }}</p>
    <p class="mb-0 muted small">You can go over the approved headcount for now, or cancel and raise it on the Departments page.</p>
    <template #footer>
      <button class="btn btn-light" @click="headcountWarning = null">Cancel</button>
      <button class="btn btn-warning" @click="confirmOverHeadcount">Save anyway</button>
    </template>
  </ModalDialog>
</template>
