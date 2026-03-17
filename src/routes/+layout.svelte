<script lang="ts">
  import "../app.css";
  import { Toaster } from "svelte-sonner";
  import type { LayoutData } from "./$types";

  let { children, data }: { children: any; data: LayoutData } = $props();
</script>

<Toaster richColors position="top-right" />
{@render children()}
