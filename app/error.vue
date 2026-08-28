<script setup lang="ts">
const props = defineProps<{ error: any }>();
</script>

<template>
  <UError :error="props.error" />
</template>