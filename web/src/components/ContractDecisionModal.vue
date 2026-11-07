<script setup>
// Decide what happens to a contract that's ending: extend it, make the employee permanent,
// or confirm it won't be renewed (which changes nothing: the contract simply ends on its date).
import { ref, computed } from "vue";
import ModalDialog from "./ModalDialog.vue";
import { api } from "../api";
import { toast } from "../toast";
import { date, addMonthsIso, todayIso } from "../utils/format";

const props = defineProps({
  employee: { type: Object, required: true }, // needs id, full_name/employee_name, contract_end_date
});
const emit = defineEmits(["close", "saved"]);

const name = computed(() => props.employee.full_name || props.employee.employee_name);
const base = computed(() => props.employee.contract_end_date || todayIso());
const choice = ref("extend");
const months = ref(12);
const customDate = ref("");
const note = ref("");
const saving = ref(false);
const error = ref("");

const newEndDate = computed(() => (months.value === "custom" ? customDate.value : addMonthsIso(base.value, Number(months.value))));

async function save() {
  error.value = "";
  saving.value = true;
  try {
    let updated;
    if (choice.value === "extend") {
      if (!newEndDate.value) throw new Error("Choose the new end date.");
      updated = await api.extendContract(props.employee.id, { new_end_date: newEndDate.value, note: note.value });
      toast.success(`${name.value}'s contract now ends on ${date(newEndDate.value)}.`);
    } else if (choice.value === "permanent") {
      updated = await api.extendContract(props.employee.id, { make_permanent: true, note: note.value });
      toast.success(`${name.value} is now a permanent employee.`);
    } else {
      updated = await api.notRenewing(props.employee.id, { note: note.value });
      toast.info(`Noted. ${name.value}'s contract will end on ${date(props.employee.contract_end_date)}.`);
    }
    emit("saved", updated);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ModalDialog :title="`Contract review: ${name}`" @close="emit('close')">
    <p class="mb-3">
      The current contract ends on <strong>{{ date(employee.contract_end_date) }}</strong>.
    </p>

    <div class="d-flex flex-column gap-2 mb-3">
      <label class="form-check">
        <input v-model="choice" class="form-check-input" type="radio" value="extend" />
        <span class="form-check-label fw-semibold">Extend the contract</span>
      </label>
      <div v-if="choice === 'extend'" class="ps-4">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <button v-for="m in [3, 6, 12, 24]" :key="m" type="button" class="btn btn-sm" :class="months === m ? 'btn-primary' : 'btn-outline-primary'" @click="months = m">
            +{{ m }} months
          </button>
          <button type="button" class="btn btn-sm" :class="months === 'custom' ? 'btn-primary' : 'btn-outline-primary'" @click="months = 'custom'">Pick a date</button>
        </div>
        <input v-if="months === 'custom'" v-model="customDate" type="date" class="form-control form-control-sm mb-2" :min="base" />
        <div class="small muted" v-if="newEndDate">New end date: <strong>{{ date(newEndDate) }}</strong></div>
      </div>

      <label class="form-check">
        <input v-model="choice" class="form-check-input" type="radio" value="permanent" />
        <span class="form-check-label fw-semibold">Make permanent</span>
      </label>

      <label class="form-check">
        <input v-model="choice" class="form-check-input" type="radio" value="ending" />
        <span class="form-check-label fw-semibold">Don't renew</span>
        <div class="small muted">Nothing changes now. The contract ends on {{ date(employee.contract_end_date) }} and the headcount slot opens up.</div>
      </label>
    </div>

    <label class="form-label small muted mb-1">Note (optional)</label>
    <textarea v-model="note" class="form-control" rows="2" placeholder="e.g. Approved by department head"></textarea>

    <div v-if="error" class="alert alert-danger mt-3 mb-0 py-2">{{ error }}</div>

    <template #footer>
      <button class="btn btn-light" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="saving" @click="save">
        <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>Save decision
      </button>
    </template>
  </ModalDialog>
</template>
