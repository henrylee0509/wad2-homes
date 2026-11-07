<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { money, date, contractLabel, contractClass, dateTime, REMINDER_STATUSES } from "../utils/format";
import HeadcountBar from "../components/HeadcountBar.vue";

const router = useRouter();
const data = ref(null);
const error = ref("");

onMounted(async () => {
  try {
    data.value = await api.dashboard();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!data" class="empty"><span class="spinner-border text-primary"></span></div>
  <div v-else>
    <div class="row g-3 mb-3">
      <div class="col-6 col-xl-3">
        <div class="stat">
          <div class="stat-label"><Icon icon="mdi:account-group-outline" /> Active employees</div>
          <div class="stat-value">{{ data.totals.active }}</div>
          <div class="stat-sub">{{ data.totals.new_this_month }} joined this month</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="stat">
          <div class="stat-label"><Icon icon="mdi:seat-outline" /> Headcount</div>
          <div class="stat-value">{{ data.totals.active }}<span class="fs-6 muted fw-normal"> / {{ data.totals.approved_headcount }}</span></div>
          <div class="stat-sub">
            {{ data.totals.vacancies }} open seat{{ data.totals.vacancies === 1 ? "" : "s" }}
            <span v-if="data.totals.over_headcount_departments" class="text-danger"> · {{ data.totals.over_headcount_departments }} dept over</span>
          </div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <RouterLink to="/contracts" class="text-decoration-none text-reset">
          <div class="stat">
            <div class="stat-label"><Icon icon="mdi:file-clock-outline" /> Contracts ending in 30 days</div>
            <div class="stat-value" :class="{ 'text-danger': data.totals.contracts_ending_30d }">{{ data.totals.contracts_ending_30d }}</div>
            <div class="stat-sub">{{ data.totals.contract }} staff on contract</div>
          </div>
        </RouterLink>
      </div>
      <div class="col-6 col-xl-3">
        <div class="stat">
          <div class="stat-label"><Icon icon="mdi:cash-multiple" /> Monthly payroll</div>
          <div class="stat-value">{{ money(data.totals.monthly_payroll) }}</div>
          <div class="stat-sub">{{ data.totals.on_leave_today }} on leave today</div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card-box h-100">
          <h2 class="section-title"><Icon icon="mdi:file-document-alert-outline" /> Contracts ending in the next 60 days</h2>
          <div v-if="!data.upcoming_contracts.length" class="empty"><Icon icon="mdi:check-circle-outline" class="icon" />No contracts ending soon.</div>
          <div v-else class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead><tr><th>Employee</th><th>Ends</th><th>Manager reminder</th></tr></thead>
              <tbody>
                <tr v-for="c in data.upcoming_contracts" :key="c.id" class="row-link" @click="router.push(`/employees/${c.id}`)">
                  <td>
                    <div class="fw-semibold">{{ c.employee_name }}</div>
                    <div class="small muted">{{ c.job_title }} · {{ c.department_name || "No department" }}</div>
                  </td>
                  <td>
                    <div>{{ date(c.contract_end_date) }}</div>
                    <span class="badge-soft" :class="contractClass(c.days_left)">{{ contractLabel(c.days_left) }}</span>
                  </td>
                  <td class="small">
                    <span v-if="c.decision === 'extended'" class="badge-soft success">Extended</span>
                    <span v-else-if="c.decision === 'ending'" class="badge-soft secondary">Not renewing</span>
                    <span v-else-if="c.reminder_status">{{ REMINDER_STATUSES[c.reminder_status] }}<br /><span class="muted">{{ dateTime(c.reminder_sent_at) }}</span></span>
                    <span v-else class="muted">Not sent yet</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="card-box h-100">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="section-title mb-0"><Icon icon="mdi:office-building-outline" /> Headcount by department</h2>
            <RouterLink to="/departments" class="small">Manage</RouterLink>
          </div>
          <div v-for="d in data.departments" :key="d.id" class="mb-3">
            <div class="fw-semibold small mb-1">{{ d.name }}</div>
            <HeadcountBar :filled="d.active_count" :limit="d.headcount_limit" />
          </div>
          <div v-if="!data.departments.length" class="empty">No departments yet.</div>
        </div>
      </div>
    </div>
  </div>
</template>
