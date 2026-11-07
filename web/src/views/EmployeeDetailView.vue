<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { toast } from "../toast";
import { money, date, dateTime, initials, contractLabel, contractClass, statusClass, EMPLOYMENT_TYPES, STATUSES, LEAVE_TYPES } from "../utils/format";
import ContractDecisionModal from "../components/ContractDecisionModal.vue";

const route = useRoute();
const router = useRouter();
const emp = ref(null);
const error = ref("");
const showSalary = ref(false);
const reviewing = ref(false);

const ACTIONS = { extended: "Extended", made_permanent: "Made permanent", ended: "Contract ended", not_renewed: "Marked as not renewing" };

async function load() {
  try {
    emp.value = await api.employee(route.params.id);
    // Opened from a reminder email: jump straight to the contract decision
    if (route.query.review === "contract" && emp.value.contract_end_date && emp.value.status === "active") reviewing.value = true;
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);

const canReview = computed(() => emp.value?.status === "active" && emp.value?.contract_end_date);
const leaveThisYear = computed(() => (emp.value?.leave || []).filter((l) => l.start_date.slice(0, 4) === String(new Date().getFullYear())));

function onSaved() {
  reviewing.value = false;
  if (route.query.review) router.replace({ query: {} });
  load();
}

async function remove() {
  if (!window.confirm(`Delete ${emp.value.full_name}? This removes their record, leave and contract history permanently. To keep records, change their status to Resigned instead.`)) return;
  try {
    await api.deleteEmployee(emp.value.id);
    toast.success("Employee deleted.");
    router.push("/employees");
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!emp" class="empty"><span class="spinner-border text-primary"></span></div>
  <div v-else>
    <RouterLink to="/employees" class="small d-inline-flex align-items-center mb-2"><Icon icon="mdi:arrow-left" class="me-1" />All employees</RouterLink>

    <div class="card-box d-flex flex-wrap align-items-center gap-3 mb-3">
      <span class="avatar avatar-lg">{{ initials(emp.full_name) }}</span>
      <div class="flex-grow-1">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <h2 class="h4 fw-bold mb-0">{{ emp.full_name }}</h2>
          <span class="badge-soft" :class="statusClass(emp.status)">{{ STATUSES[emp.status] }}</span>
          <span class="badge-soft info">{{ EMPLOYMENT_TYPES[emp.employment_type] }}</span>
        </div>
        <div class="muted">{{ emp.job_title || "No job title" }} · {{ emp.department_name || "No department" }} · {{ emp.employee_no }}</div>
      </div>
      <div class="d-flex gap-2">
        <button v-if="canReview" class="btn btn-outline-primary" @click="reviewing = true"><Icon icon="mdi:file-document-edit-outline" class="me-1" />Review contract</button>
        <RouterLink :to="`/employees/${emp.id}/edit`" class="btn btn-primary"><Icon icon="mdi:pencil" class="me-1" />Edit</RouterLink>
      </div>
    </div>

    <div v-if="canReview && emp.days_to_contract_end <= 30" class="alert d-flex align-items-center gap-2" :class="emp.days_to_contract_end <= 14 ? 'alert-danger' : 'alert-warning'">
      <Icon icon="mdi:alert-outline" class="fs-5" />
      <div class="flex-grow-1">
        Contract {{ contractLabel(emp.days_to_contract_end).toLowerCase() }} ({{ date(emp.contract_end_date) }}). If it isn't extended, it ends automatically on that date.
      </div>
      <button class="btn btn-sm btn-dark" @click="reviewing = true">Decide</button>
    </div>

    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card-box">
          <h3 class="section-title"><Icon icon="mdi:card-account-details-outline" /> Personal</h3>
          <dl class="info">
            <dt>Date of birth</dt><dd>{{ date(emp.date_of_birth) }}<span v-if="emp.age != null" class="muted fw-normal"> ({{ emp.age }} years old)</span></dd>
            <dt>Gender</dt><dd>{{ emp.gender || "–" }}</dd>
            <dt>Address</dt><dd>{{ emp.address || "–" }}</dd>
          </dl>
        </div>
        <div class="card-box">
          <h3 class="section-title"><Icon icon="mdi:phone-outline" /> Contact</h3>
          <dl class="info">
            <dt>Email</dt><dd><a v-if="emp.email" :href="`mailto:${emp.email}`">{{ emp.email }}</a><span v-else>–</span></dd>
            <dt>Phone</dt><dd><a v-if="emp.phone" :href="`tel:${emp.phone.replace(/\s/g, '')}`">{{ emp.phone }}</a><span v-else>–</span></dd>
            <dt>Emergency contact</dt><dd>{{ emp.emergency_contact_name || "–" }}<span v-if="emp.emergency_contact_phone" class="muted fw-normal"> · {{ emp.emergency_contact_phone }}</span></dd>
          </dl>
        </div>
        <div v-if="emp.notes" class="card-box">
          <h3 class="section-title"><Icon icon="mdi:note-text-outline" /> Notes</h3>
          <p class="mb-0" style="white-space: pre-line">{{ emp.notes }}</p>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card-box">
          <h3 class="section-title"><Icon icon="mdi:briefcase-outline" /> Employment</h3>
          <dl class="info">
            <dt>Department</dt><dd>{{ emp.department_name || "–" }}</dd>
            <dt>Manager</dt><dd><RouterLink v-if="emp.manager_id" :to="`/employees/${emp.manager_id}`">{{ emp.manager_name }}</RouterLink><span v-else>–</span></dd>
            <dt>Start date</dt><dd>{{ date(emp.start_date) }}</dd>
            <dt>Contract end</dt>
            <dd>
              <template v-if="emp.contract_end_date">
                {{ date(emp.contract_end_date) }}
                <span v-if="emp.status === 'active'" class="badge-soft ms-1" :class="contractClass(emp.days_to_contract_end)">{{ contractLabel(emp.days_to_contract_end) }}</span>
              </template>
              <span v-else>No end date</span>
            </dd>
            <dt>Monthly salary</dt>
            <dd>
              {{ showSalary ? money(emp.salary) : "••••••" }}
              <button class="btn btn-link btn-sm p-0 ms-1 align-baseline" @click="showSalary = !showSalary">{{ showSalary ? "Hide" : "Show" }}</button>
            </dd>
            <dt>Direct reports</dt>
            <dd>
              <span v-if="!emp.reports.length">–</span>
              <span v-for="(r, i) in emp.reports" :key="r.id"><RouterLink :to="`/employees/${r.id}`">{{ r.full_name }}</RouterLink><span v-if="i < emp.reports.length - 1">, </span></span>
            </dd>
          </dl>
        </div>

        <div class="card-box">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h3 class="section-title mb-0"><Icon icon="mdi:beach" /> Leave this year</h3>
            <RouterLink :to="{ path: '/leave', query: { employee_id: emp.id } }" class="small">Record leave</RouterLink>
          </div>
          <div class="d-flex gap-4 mb-3">
            <div><div class="stat-value">{{ emp.leave_remaining }}</div><div class="small muted">annual days left</div></div>
            <div><div class="stat-value muted">{{ emp.annual_leave_taken }}</div><div class="small muted">taken of {{ emp.annual_leave_days }}</div></div>
          </div>
          <ul v-if="leaveThisYear.length" class="list-unstyled small mb-0">
            <li v-for="l in leaveThisYear" :key="l.id" class="d-flex justify-content-between py-1 border-top">
              <span>{{ LEAVE_TYPES[l.leave_type] }} · {{ date(l.start_date) }}<span v-if="l.end_date !== l.start_date"> – {{ date(l.end_date) }}</span></span>
              <span class="muted">{{ l.days }} day{{ l.days === 1 ? "" : "s" }}</span>
            </li>
          </ul>
          <div v-else class="small muted">No leave taken this year.</div>
        </div>

        <div class="card-box">
          <h3 class="section-title"><Icon icon="mdi:history" /> Contract history</h3>
          <ul v-if="emp.contract_history.length" class="list-unstyled small mb-0">
            <li v-for="h in emp.contract_history" :key="h.id" class="py-2 border-top">
              <div class="fw-semibold">{{ ACTIONS[h.action] || h.action }}</div>
              <div class="muted">
                <span v-if="h.action === 'extended'">{{ date(h.old_end_date) }} → {{ date(h.new_end_date) }} · </span>
                {{ dateTime(h.changed_at) }} · {{ h.changed_by }}
              </div>
              <div v-if="h.note">{{ h.note }}</div>
            </li>
          </ul>
          <div v-else class="small muted">No contract changes yet.</div>
        </div>
      </div>
    </div>

    <div class="text-end mt-4">
      <button class="btn btn-link text-danger" @click="remove"><Icon icon="mdi:delete-outline" class="me-1" />Delete employee</button>
    </div>

    <ContractDecisionModal v-if="reviewing" :employee="emp" @close="reviewing = false" @saved="onSaved" />
  </div>
</template>
