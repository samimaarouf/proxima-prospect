<script lang="ts">
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();
</script>

<div class="min-h-screen flex items-center justify-center bg-background">
  <div class="w-full max-w-sm space-y-6 p-8 border border-border rounded-xl shadow-sm bg-card">
    <div class="text-center space-y-1">
      <h1 class="text-2xl font-bold tracking-tight">Proxima Prospect</h1>
      <p class="text-sm text-muted-foreground">Connectez-vous pour continuer</p>
    </div>

    {#if form?.error}
      <div class="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
        {form.error}
      </div>
    {/if}

    <form method="POST" class="space-y-4">
      <div class="space-y-1">
        <label for="email" class="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autocomplete="email"
          class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="vous@exemple.com"
        />
      </div>

      <div class="space-y-1">
        <label for="password" class="text-sm font-medium">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autocomplete="current-password"
          class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        class="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Se connecter
      </button>
    </form>
  </div>
</div>
