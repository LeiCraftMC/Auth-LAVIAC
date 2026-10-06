<template>
	<NuxtLoadingIndicator color="var(--ui-primary)" position="top" />

	<!-- Internal-only app: no public header/footer, just the logo above the card (as in the
	template's onboarding layout). -->
	<div class="main-bg-color flex min-h-screen flex-col text-slate-100">
		<UMain class="relative flex-1">
			<div
				class="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-primary/5 to-transparent"
			></div>
			<div class="flex min-h-screen flex-col items-center justify-center px-4 py-10">
				<ImgAppLogo class="mb-8 h-8" />
				<UPageCard class="w-full max-w-md border-slate-800">
					<slot />
				</UPageCard>
			</div>
		</UMain>
	</div>
</template>
