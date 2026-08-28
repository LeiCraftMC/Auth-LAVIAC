<template>
  <div class="flex h-screen main-bg-color text-slate-200">
    <LayoutAppSidebar />
    <div class="flex flex-1 flex-col overflow-hidden">
      <LayoutAppHeader />
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>