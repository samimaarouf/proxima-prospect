<script lang="ts">
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();

  let mode = $state<"login" | "register">(
    (form as { mode?: string } | null)?.mode === "register" ? "register" : "login"
  );
</script>

<div class="min-h-screen flex items-center justify-center bg-background">
  <div class="w-full max-w-sm space-y-6 p-8 border border-border rounded-xl shadow-sm bg-card">
    <!-- Header -->
    <div class="text-center space-y-1">
      <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg mx-auto mb-3">
        P
      </div>
      <h1 class="text-2xl font-bold tracking-tight">Proxima Entreprise</h1>
      <p class="text-sm text-muted-foreground">
        {mode === "login" ? "Connectez-vous pour continuer" : "Créez votre compte"}
      </p>
    </div>

    <!-- Mode toggle -->
    <div class="flex rounded-lg border border-border overflow-hidden text-sm">
      <button
        type="button"
        onclick={() => (mode = "login")}
        class="flex-1 py-2 font-medium transition-colors {mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}"
      >
        Connexion
      </button>
      <button
        type="button"
        onclick={() => (mode = "register")}
        class="flex-1 py-2 font-medium transition-colors {mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}"
      >
        Inscription
      </button>
    </div>

    <!-- Error -->
    {#if form?.error && (form as { mode?: string })?.mode === mode}
      <div class="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
        {form.error}
      </div>
    {/if}

    <!-- Login form -->
    {#if mode === "login"}
      <form method="POST" action="?/login" class="space-y-4">
        <div class="space-y-1">
          <label for="login-email" class="text-sm font-medium">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="vous@exemple.com"
          />
        </div>
        <div class="space-y-1">
          <label for="login-password" class="text-sm font-medium">Mot de passe</label>
          <input
            id="login-password"
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
    {/if}

    <!-- Register form -->
    {#if mode === "register"}
      <form method="POST" action="?/register" class="space-y-4">
        <div class="space-y-1">
          <label for="reg-name" class="text-sm font-medium">Nom complet</label>
          <input
            id="reg-name"
            name="name"
            type="text"
            required
            autocomplete="name"
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Prénom Nom"
          />
        </div>
        <div class="space-y-1">
          <label for="reg-email" class="text-sm font-medium">Email</label>
          <input
            id="reg-email"
            name="email"
            type="email"
            required
            autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="vous@exemple.com"
          />
        </div>
        <div class="space-y-1">
          <label for="reg-password" class="text-sm font-medium">Mot de passe</label>
          <input
            id="reg-password"
            name="password"
            type="password"
            required
            autocomplete="new-password"
            minlength={8}
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="8 caractères minimum"
          />
        </div>
        <div class="space-y-1">
          <label for="reg-confirm" class="text-sm font-medium">Confirmer le mot de passe</label>
          <input
            id="reg-confirm"
            name="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          class="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Créer mon compte
        </button>
      </form>
    {/if}
  </div>
</div>
