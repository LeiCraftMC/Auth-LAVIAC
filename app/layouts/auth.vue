<template>
  <div class="flex min-h-screen items-center justify-center main-bg-color p-4 text-slate-200">
    <div class="w-full max-w-md">
      <div class="mb-6 flex flex-col items-center gap-3">
        <ImgAppLogo class="h-10 w-auto" />
        <div class="text-center">
          <h1 class="text-lg font-semibold text-white">LAVIAC</h1>
          <p class="text-sm text-slate-400">LeiCraft Auth Virtual Instance Admin Console</p>
        </div>
      </div>
      <UCard>
        <slot />
      </UCard>
    </div>
  </div>
</template>