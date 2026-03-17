<script lang="ts">
  import "ag-grid-enterprise";
  import { AgGrid } from "ag-grid-svelte5-extended";
  import { ClientSideRowModelModule } from "@ag-grid-community/client-side-row-model";
  import {
    InfiniteRowModelModule,
    ServerSideRowModelModule,
  } from "ag-grid-enterprise";
  import { themeQuartz } from "@ag-grid-community/theming";
  import {
    type GridOptions,
    type GridApi,
    type GridReadyEvent,
    type Module,
  } from "@ag-grid-community/core";
  import { AgLoader } from "./AgLoader";
  import { toast } from "svelte-sonner";

  // Utiliser une référence mutable pour que le datasource lise toujours la valeur actuelle
  let dataToSendRef: { current: Record<string, any> } = $state({ current: {} });
  let currentApiUrl = $state<string | undefined>(undefined);
  
  // Synchroniser currentApiUrl avec apiUrl quand il change
  $effect(() => {
    currentApiUrl = apiUrl;
  });
  
  // Helper pour mettre à jour la référence
  const setDataToSendValue = (value: Record<string, any>) => {
    dataToSendRef.current = { ...value };
  };
  
  // Helper pour lire la référence (utilisé dans les datasources)
  const getCurrentDataToSend = () => dataToSendRef.current;

  // Props
  let {
    rowData = [],
    gridOptions = {},
    rowModelType = "clientSide",
    apiUrl,
    quickFilterText,
    gridStyle,
    enableRowSelection = true,
    nbRows = 10,
  }: {
    rowData?: any[];
    gridOptions?: GridOptions;
    rowModelType?: "clientSide" | "serverSide" | "infinite";
    apiUrl?: string;
    quickFilterText?: string;
    gridStyle?: string;
    enableRowSelection?: boolean;
    nbRows?: number;
  } = $props();

  // Modules dynamiques
  const modules: Module[] =
    rowModelType === "serverSide"
      ? [ServerSideRowModelModule]
      : rowModelType === "infinite"
        ? [InfiniteRowModelModule]
        : [ClientSideRowModelModule];

  let gridApi: GridApi | null = $state(null);
  let isInitialLoad = $state(true);

  // Fonction utilitaire pour construire une URL avec paramètres GET
  function buildUrlWithParams(
    baseUrl: string,
    params: Record<string, any> = {}
  ): string {
    const url = new URL(baseUrl, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    return url.toString();
  }

  // Fusion entre options par défaut et celles passées en props
  const mergedOptions: GridOptions = $derived({
    theme: themeQuartz,
    rowModelType,
    animateRows: true,
    includeHiddenColumnsInQuickFilter: true,
    domLayout: gridStyle ? undefined : "normal",
    pagination: rowModelType === "clientSide",
    paginationPageSize: nbRows,
    paginationPageSizeSelector: [1, 5, 10],
    cacheBlockSize: rowModelType === "infinite" ? nbRows : undefined,
    loading: isInitialLoad && rowModelType === "clientSide",

    loadingOverlayComponent: AgLoader,
    loadingOverlayComponentParams: {
      loadingMessage: "Chargement en cours...",
    },

    // Sélection conditionnelle
    ...(enableRowSelection && {
      rowSelection: "multiple",
    }),

    // Pour le mode infinite
    ...(rowModelType === "infinite" && {
      rowBuffer: 0,
      cacheOverflowSize: 2,
      maxConcurrentDatasourceRequests: 1,
      infiniteInitialRowCount: 1000,
      maxBlocksInCache: 10,
    }),

    // Tes options personnalisées prennent le dessus
    ...gridOptions,

    onGridReady: (event: GridReadyEvent) => {
      gridApi = event.api;

      // --- Mode Infinite ---
      if (rowModelType === "infinite" && apiUrl) {
        const dataSource = {
          getRows: async (params: any) => {
            try {
              const startRow = params.startRow;
              const endRow = params.endRow;
              const pageSize = endRow - startRow;
              const page = Math.floor(startRow / pageSize) + 1;

              const currentData = getCurrentDataToSend();
              const queryParams = {
                page,
                pageSize,
                ...currentData,
              };

              const fullUrl = buildUrlWithParams(currentApiUrl || apiUrl || "", queryParams);
              const response = await fetch(fullUrl);
              const data = await response.json();

              const rowsThisPage = data.rows ?? [];
              let lastRow = -1;

              if (rowsThisPage.length < pageSize) {
                lastRow = startRow + rowsThisPage.length;
              }

              params.successCallback(rowsThisPage, lastRow);
            } catch (error) {
              console.error("Error fetching data:", error);
              params.failCallback();
            }
          },
        };

        gridApi.setGridOption("datasource", dataSource);
      }

      // --- Mode ServerSide ---
      else if (rowModelType === "serverSide" && apiUrl) {
        // Fonction pour créer un datasource qui lit toujours la valeur actuelle de dataToSend
        const createDataSource = () => ({
          getRows: async (params: any) => {
            try {
              const pageSize = params.request.endRow - params.request.startRow;
              const page = Math.floor(params.request.startRow / pageSize) + 1;

              // Lire dataToSend via la référence pour qu'il soit toujours à jour
              const currentData = getCurrentDataToSend();
              const queryParams = {
                page,
                pageSize,
                ...currentData,
              };

              console.log("onGridReady datasource getRows - queryParams:", queryParams);
              const fullUrl = buildUrlWithParams(currentApiUrl || apiUrl || "", queryParams);
              const response = await fetch(fullUrl);
              const data = await response.json().catch(() => ({
                error: "Erreur lors de la récupération des données",
              }));

              if (!response.ok) {
                console.error("Error fetching data:", data);

                if (data.error && typeof window !== "undefined") {
                  const message = String(data.error);
                  if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                    toast.error(
                      "Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.",
                    );
                  } else {
                    toast.error(message);
                  }
                }

                params.fail();
                return;
              }

              // Stocker le searchId pour l'archivage
              if (data.searchId) {
                dataToSendRef.current.searchId = data.searchId;
              }

              // S'assurer que lastRow est un nombre valide
              let lastRow = -1;
              if (data.lastRow !== undefined && data.lastRow !== null) {
                const parsed = typeof data.lastRow === 'number' 
                  ? data.lastRow 
                  : Number(data.lastRow);
                lastRow = !isNaN(parsed) && parsed >= 0 ? parsed : -1;
              }

              params.success({
                rowData: data.rows ?? [],
                rowCount: lastRow,
              });
            } catch (error) {
              console.error("Error fetching data:", error);
              params.fail();
            }
          },
        });
        
        const dataSource = createDataSource();
        gridApi.setGridOption("cacheBlockSize", nbRows);
        gridApi.setGridOption("rowBuffer", 0);
        gridApi.setGridOption("serverSideDatasource", dataSource);
      }

      // Si le parent a défini onGridReady, on l'appelle
      gridOptions.onGridReady?.(event);
    },
  });

  // --- Méthodes exportées ---
  export function setLoading(value: boolean) {
    gridApi?.setGridOption("loading", value);
  }

  export function clearSelection() {
    gridApi?.deselectAll();
  }

  export function setApiUrl(newUrl: string | undefined) {
    currentApiUrl = newUrl;
    // Recréer le datasource avec la nouvelle URL
    if (gridApi && rowModelType === "serverSide") {
      const createDataSource = () => ({
        getRows: async (params: any) => {
          try {
            const pageSize = params.request.endRow - params.request.startRow;
            const page = Math.floor(params.request.startRow / pageSize) + 1;

            const currentData = getCurrentDataToSend();
            const queryParams = {
              page,
              pageSize,
              ...currentData,
            };

            const urlToUse = currentApiUrl || apiUrl || "";
            if (!urlToUse) {
              console.error("No API URL available");
              params.fail();
              return;
            }

            const url = buildUrlWithParams(urlToUse, queryParams);
            const response = await fetch(url);
            const data = await response.json().catch(() => ({
              error: "Erreur lors de la récupération des données",
            }));

            if (!response.ok) {
              console.error("Error fetching data:", data);

              if (data.error && typeof window !== "undefined") {
                const message = String(data.error);
                if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                  toast.error(
                    "Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.",
                  );
                } else {
                  toast.error(message);
                }
              }

              params.fail();
              return;
            }
            const lastRow = data.lastRow ?? data.rows?.length ?? 0;

            // Stocker le searchId pour l'archivage
            if (data.searchId) {
              dataToSendRef.current.searchId = data.searchId;
            }

            params.success({
              rowData: data.rows ?? [],
              rowCount: lastRow,
            });
          } catch (error) {
            console.error("Error fetching data:", error);
            params.fail();
          }
        },
      });
      
      const dataSource = createDataSource();
      gridApi.setGridOption("serverSideDatasource", dataSource);
      // Forcer le refresh après avoir changé le datasource
      gridApi.refreshServerSide({ purge: true });
    }
  }

  export function setDataToSend(data: Record<string, any>) {
    console.log("setDataToSend called with:", data);
    // Mettre à jour la référence mutable
    setDataToSendValue(data);
    console.log("dataToSendRef.current updated to:", dataToSendRef.current);
    
    // Recréer le datasource pour qu'il utilise les nouvelles données
    if (gridApi && rowModelType === "serverSide" && currentApiUrl) {
      const createDataSource = () => ({
        getRows: async (params: any) => {
          try {
            const pageSize = params.request.endRow - params.request.startRow;
            const page = Math.floor(params.request.startRow / pageSize) + 1;

            // Lire via la référence pour qu'il soit toujours à jour
            const currentData = getCurrentDataToSend();
            const queryParams = {
              page,
              pageSize,
              ...currentData,
            };

            console.log("Datasource getRows called with queryParams:", queryParams);
            const fullUrl = buildUrlWithParams(apiUrl, queryParams);
            const response = await fetch(fullUrl);
            const responseData = await response.json().catch(() => ({
              error: "Erreur lors de la récupération des données",
            }));
            console.log("Response data:", responseData);

            if (!response.ok) {
              console.error("Error fetching data:", responseData);

              if (responseData.error && typeof window !== "undefined") {
                const message = String(responseData.error);
                if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                  toast.error(
                    "Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.",
                  );
                } else {
                  toast.error(message);
                }
              }

              params.fail();
              return;
            }

            // Stocker le searchId pour l'archivage
            if (responseData.searchId) {
              dataToSendRef.current.searchId = responseData.searchId;
            }

            let lastRow = -1;
            if (responseData.lastRow !== undefined && responseData.lastRow !== null) {
              const parsed = typeof responseData.lastRow === 'number' 
                ? responseData.lastRow 
                : Number(responseData.lastRow);
              lastRow = !isNaN(parsed) && parsed >= 0 ? parsed : -1;
            }

            params.success({
              rowData: responseData.rows ?? [],
              rowCount: lastRow,
            });
          } catch (error) {
            console.error("Error fetching data:", error);
            params.fail();
          }
        },
      });
      
      // Recréer le datasource avec les nouvelles données
      const newDataSource = createDataSource();
      console.log("Setting new datasource");
      gridApi.setGridOption("serverSideDatasource", newDataSource);
    }
  }

  export function getDataToSend(): Record<string, any> {
    return dataToSendRef.current;
  }

  export function getGridApi() {
    return gridApi;
  }

  export function selectAll() {
    gridApi?.selectAll();
  }

  export function getSelectedRows() {
    return gridApi?.getSelectedRows() ?? [];
  }

  export function exportToCSV() {
    gridApi?.exportDataAsCsv();
  }

  // --- Effet de mise à jour du mode clientSide ---
  $effect(() => {
    if (gridApi && rowModelType === "clientSide") {
      gridApi.setGridOption("rowData", rowData);
      isInitialLoad = false;
    }
  });

  // --- Effet pour appliquer le quickFilter ---
  $effect(() => {
    if (gridApi) {
      // Utiliser setGridOption pour appliquer le filtre de recherche
      gridApi.setGridOption("quickFilterText", quickFilterText || "");
    }
  });
</script>

<AgGrid
  gridOptions={mergedOptions}
  rowData={rowModelType === "clientSide" ? rowData : undefined}
  {modules}
  {quickFilterText}
  {gridStyle}
/>