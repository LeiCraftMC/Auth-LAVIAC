<script setup lang="ts">
const items = [
	{ label: "Instances", icon: "i-lucide-server", to: "/instances" },
	{ label: "New instance", icon: "i-lucide-plus-circle", to: "/instances/create" },
] satisfies NavigationMenuItem[];
</script>

<template>
  <aside class="flex h-full w-56 shrink-0 flex-col border-r border-slate-800 main-bg-color">
    <NuxtLink to="/instances" class="flex items-center gap-2 px-4 py-4 text-white">
      <ImgAppLogo class="h-7 w-auto" />
      <span class="text-sm font-semibold">LAVIAC</span>
    </NuxtLink>

    <nav class="flex flex-1 flex-col gap-1 px-3">
      <UButton
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :icon="item.icon"
        :label="item.label"
        variant="ghost"
        color="neutral"
        class="justify-start"
        active-class="bg-slate-800 text-white"
      />
    </nav>

    <div class="px-3 py-4 text-xs text-slate-600">
      Zitadel System API
    </div>
  </aside>
</template>