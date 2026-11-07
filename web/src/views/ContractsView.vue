<script setup>
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { toast } from "../toast";
import { date, dateTime, contractLabel, contractClass, REMINDER_STATUSES } from "../utils/format";
import ContractDecisionModal from "../components/ContractDecisionModal.vue";

const router = useRouter();
const days = ref(90);
const upcoming = ref([]);
const reminders = ref([]);
const settings = ref(null);
const loading = ref(true);
const reviewing = ref(null);

async function load() {
  loading.value = true;
  try {
    [upcoming.value, reminders.value, settings.value] = await Promise.all([api.upcomingContracts(days.value), api.reminders(), api.settings()]);
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(days, load);

function onSaved() {
  reviewing.value = null;
  load();
}

const reminderClass = (s) => ({ sent: "success", logged: "info", failed: "danger", no_recipient: "warning" })[s] || "secondary";
</script>

<template>
  <div class="alert alert-light border d-flex gap-2 align-items-start">
    <Icon icon="mdi:email-fast-outline" class="fs-4 text-primary flex-shrink-0" />
    <div class="small">
      <strong>How reminders work:</strong> {{ settings?.reminder_days_before || 30 }} days before a contract ends, the notifier emails the employee's manager
      (or the department head, or HR) once, asking whether to extend. If nobody extends it, the contract ends on its end date automatically and the headcount slot opens up.
      <RouterLink to="/settings">Change the timing</RouterLink>.
    </div>
  </div>

  <div class="card-box">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h2 class="section-title mb-0"><Icon icon="mdi:calendar-clock" /> Contracts ending soon</h2>
      <select v-model="days" class="form-select form-select-sm w-auto" aria-label="Time range">
        <option :value="30">Next 30 days</option>
        <option :value="60">Next 60 days</option>
        <option :value="90">Next 90 days</option>
        <option :value="180">Next 6 months</option>
        <option :value="365">Next 12 months</option>
      </select>
    </div>
    <div v-if="loading && !upcoming.length" class="empty"><span class="spinner-border text-primary"></span></div>
    <div v-else-if="!upcoming.length" class="empty"><Icon icon="mdi:check-circle-outline" class="icon" />No contracts ending in this period.</div>
    <div v-else class="table-responsive">
      <table class="table align-middle mb-0">
        <thead><tr><th>Employee</th><th>Ends</th><th>Decides</th><th>Reminder</th><th>Decision</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in upcoming" :key="c.id">
            <td>
              <RouterLink :to="`/employees/${c.id}`" class="fw-semibold text-decoration-none">{{ c.employee_name }}</RouterLink>
              <div class="small muted">{{ c.job_title }} · {{ c.department_name || "No department" }}</div>
            </td>
            <td><div>{{ date(c.contract_end_date) }}</div><span class="badge-soft" :class="contractClass(c.days_left)">{{ contractLabel(c.days_left) }}</span></td>
            <td class="small">{{ c.decider_name || "HR" }}</td>
            <td class="small">
              <template v-if="c.reminder_status">
                <span class="badge-soft" :class="reminderClass(c.reminder_status)">{{ REMINDER_STATUSES[c.reminder_status] }}</span>
                <div class="muted mt-1">{{ c.reminder_recipient }}</div>
              </template>
              <span v-else class="muted">{{ c.days_left <= (settings?.reminder_days_before || 30) ? "Sending soon" : "Not due yet" }}</span>
            </td>
            <td class="small">
              <span v-if="c.decision === 'extended'" class="badge-soft success">Extended</span>
              <span v-else-if="c.decision === 'ending'" class="badge-soft secondary">Not renewing</span>
              <span v-else class="muted">Pending (ends if no action)</span>
            </td>
            <td class="text-end"><button class="btn btn-sm btn-outline-primary" @click="reviewing = c">Decide</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card-box">
    <h2 class="section-title"><Icon icon="mdi:email-check-outline" /> Reminder log</h2>
    <div v-if="!reminders.length" class="empty small">No reminders sent yet. Start the notifier service to send them.</div>
    <div v-else class="table-responsive">
      <table class="table table-hover align-middle mb-0 small">
        <thead><tr><th>When</th><th>Employee</th><th>Contract end</th><th>Sent to</th><th>Status</th><th>Decision</th></tr></thead>
        <tbody>
          <tr v-for="r in reminders" :key="r.id" class="row-link" @click="router.push(`/employees/${r.employee_id}`)">
            <td>{{ dateTime(r.sent_at) }}</td>
            <td>{{ r.employee_name }}</td>
            <td>{{ date(r.contract_end_date) }}</td>
            <td>{{ r.recipient || "–" }}</td>
            <td>
              <span class="badge-soft" :class="reminderClass(r.status)">{{ REMINDER_STATUSES[r.status] || r.status }}</span>
              <div v-if="r.error" class="text-danger mt-1">{{ r.error }}</div>
            </td>
            <td>{{ r.decision === "extended" ? "Extended" : r.decision === "ending" ? "Not renewing" : "–" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <ContractDecisionModal v-if="reviewing" :employee="reviewing" @close="reviewing = null" @saved="onSaved" />
</template>
