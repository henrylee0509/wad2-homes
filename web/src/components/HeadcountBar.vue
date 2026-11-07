<script setup>
import { computed } from "vue";

const props = defineProps({
  filled: { type: Number, required: true },
  limit: { type: Number, default: 0 },
});

const pct = computed(() => (props.limit > 0 ? Math.min(100, (100 * props.filled) / props.limit) : 0));
const state = computed(() => (props.limit <= 0 ? "" : props.filled > props.limit ? "over" : props.filled === props.limit ? "full" : ""));
</script>

<template>
  <div>
    <div class="d-flex justify-content-between small mb-1">
      <span class="fw-semibold">{{ filled }}<span class="muted fw-normal"> / {{ limit > 0 ? limit : "no limit" }}</span></span>
      <span v-if="state === 'over'" class="text-danger fw-semibold">{{ filled - limit }} over</span>
      <span v-else-if="state === 'full'" class="text-warning fw-semibold">Full</span>
      <span v-else-if="limit > 0" class="muted">{{ limit - filled }} open</span>
    </div>
    <div class="headcount-bar" :class="state" role="progressbar" :aria-valuenow="filled" :aria-valuemax="limit || undefined">
      <div :style="{ width: (limit > 0 ? pct : 0) + '%' }"></div>
    </div>
  </div>
</template>
