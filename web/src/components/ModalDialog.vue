<script setup>
import { onMounted, onBeforeUnmount } from "vue";

defineProps({ title: { type: String, required: true } });
const emit = defineEmits(["close"]);

const onKey = (e) => e.key === "Escape" && emit("close");
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="modal-backdrop-custom" @mousedown.self="emit('close')">
    <div class="modal-panel" role="dialog" aria-modal="true" :aria-label="title">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="btn-close" aria-label="Close" @click="emit('close')"></button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </div>
  </div>
</template>
