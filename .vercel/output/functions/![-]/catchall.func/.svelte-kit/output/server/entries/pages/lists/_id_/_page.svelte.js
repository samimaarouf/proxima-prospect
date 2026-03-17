import { d as attr_style, a as attr_class, c as clsx, l as bind_props, i as derived, b as attr, e as ensure_array_like, j as stringify } from "../../../../chunks/index3.js";
import "ag-grid-enterprise";
import { themeQuartz } from "@ag-grid-community/theming";
import { a as toast } from "../../../../chunks/toast-state.svelte.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function AgGrid($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      gridClass,
      gridStyle
    } = $$props;
    $$renderer2.push(`<div${attr_style(gridStyle ?? "height: 100%;")}${attr_class(clsx(gridClass ?? "ag-theme-quartz"))}></div>`);
  });
}
class AgLoader {
  eGui;
  init(params) {
    this.eGui = document.createElement("div");
    this.refresh(params);
  }
  getGui() {
    return this.eGui;
  }
  refresh(params) {
    this.eGui.innerHTML = `<div class="ag-overlay-loading-center" role="presentation">
        <div role="presentation" style="height:100px; width:100px; background: url(https://www.ag-grid.com/images/ag-grid-loading-spinner.svg) center / contain no-repeat; margin: 0 auto;"></div>
        <div aria-live="polite" aria-atomic="true">${params.loadingMessage}</div>
     </div>`;
  }
}
function AgGrid_1($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let dataToSendRef = { current: {} };
    let currentApiUrl = void 0;
    const setDataToSendValue = (value) => {
      dataToSendRef.current = { ...value };
    };
    const getCurrentDataToSend = () => dataToSendRef.current;
    let {
      rowData = [],
      gridOptions = {},
      rowModelType = "clientSide",
      apiUrl,
      quickFilterText,
      gridStyle,
      enableRowSelection = true,
      nbRows = 10
    } = $$props;
    let gridApi = null;
    function buildUrlWithParams(baseUrl, params = {}) {
      const url = new URL(baseUrl, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== void 0 && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
      return url.toString();
    }
    const mergedOptions = derived(() => ({
      theme: themeQuartz,
      rowModelType,
      animateRows: true,
      includeHiddenColumnsInQuickFilter: true,
      domLayout: gridStyle ? void 0 : "normal",
      pagination: rowModelType === "clientSide",
      paginationPageSize: nbRows,
      paginationPageSizeSelector: [1, 5, 10],
      cacheBlockSize: rowModelType === "infinite" ? nbRows : void 0,
      loading: rowModelType === "clientSide",
      loadingOverlayComponent: AgLoader,
      loadingOverlayComponentParams: { loadingMessage: "Chargement en cours..." },
      // Sélection conditionnelle
      ...enableRowSelection && { rowSelection: "multiple" },
      // Pour le mode infinite
      ...rowModelType === "infinite" && {
        rowBuffer: 0,
        cacheOverflowSize: 2,
        maxConcurrentDatasourceRequests: 1,
        infiniteInitialRowCount: 1e3,
        maxBlocksInCache: 10
      },
      // Tes options personnalisées prennent le dessus
      ...gridOptions,
      onGridReady: (event) => {
        gridApi = event.api;
        if (rowModelType === "infinite" && apiUrl) {
          const dataSource = {
            getRows: async (params) => {
              try {
                const startRow = params.startRow;
                const endRow = params.endRow;
                const pageSize = endRow - startRow;
                const page = Math.floor(startRow / pageSize) + 1;
                const currentData = getCurrentDataToSend();
                const queryParams = { page, pageSize, ...currentData };
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
            }
          };
          gridApi.setGridOption("datasource", dataSource);
        } else if (rowModelType === "serverSide" && apiUrl) {
          const createDataSource = () => ({
            getRows: async (params) => {
              try {
                const pageSize = params.request.endRow - params.request.startRow;
                const page = Math.floor(params.request.startRow / pageSize) + 1;
                const currentData = getCurrentDataToSend();
                const queryParams = { page, pageSize, ...currentData };
                console.log("onGridReady datasource getRows - queryParams:", queryParams);
                const fullUrl = buildUrlWithParams(currentApiUrl || apiUrl || "", queryParams);
                const response = await fetch(fullUrl);
                const data = await response.json().catch(() => ({ error: "Erreur lors de la récupération des données" }));
                if (!response.ok) {
                  console.error("Error fetching data:", data);
                  if (data.error && typeof window !== "undefined") {
                    const message = String(data.error);
                    if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                      toast.error("Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.");
                    } else {
                      toast.error(message);
                    }
                  }
                  params.fail();
                  return;
                }
                if (data.searchId) {
                  dataToSendRef.current.searchId = data.searchId;
                }
                let lastRow = -1;
                if (data.lastRow !== void 0 && data.lastRow !== null) {
                  const parsed = typeof data.lastRow === "number" ? data.lastRow : Number(data.lastRow);
                  lastRow = !isNaN(parsed) && parsed >= 0 ? parsed : -1;
                }
                params.success({ rowData: data.rows ?? [], rowCount: lastRow });
              } catch (error) {
                console.error("Error fetching data:", error);
                params.fail();
              }
            }
          });
          const dataSource = createDataSource();
          gridApi.setGridOption("cacheBlockSize", nbRows);
          gridApi.setGridOption("rowBuffer", 0);
          gridApi.setGridOption("serverSideDatasource", dataSource);
        }
        gridOptions.onGridReady?.(event);
      }
    }));
    function setLoading(value) {
      gridApi?.setGridOption("loading", value);
    }
    function clearSelection() {
      gridApi?.deselectAll();
    }
    function setApiUrl(newUrl) {
      currentApiUrl = newUrl;
      if (gridApi && rowModelType === "serverSide") {
        const createDataSource = () => ({
          getRows: async (params) => {
            try {
              const pageSize = params.request.endRow - params.request.startRow;
              const page = Math.floor(params.request.startRow / pageSize) + 1;
              const currentData = getCurrentDataToSend();
              const queryParams = { page, pageSize, ...currentData };
              const urlToUse = currentApiUrl || apiUrl || "";
              if (!urlToUse) {
                console.error("No API URL available");
                params.fail();
                return;
              }
              const url = buildUrlWithParams(urlToUse, queryParams);
              const response = await fetch(url);
              const data = await response.json().catch(() => ({ error: "Erreur lors de la récupération des données" }));
              if (!response.ok) {
                console.error("Error fetching data:", data);
                if (data.error && typeof window !== "undefined") {
                  const message = String(data.error);
                  if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                    toast.error("Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.");
                  } else {
                    toast.error(message);
                  }
                }
                params.fail();
                return;
              }
              const lastRow = data.lastRow ?? data.rows?.length ?? 0;
              if (data.searchId) {
                dataToSendRef.current.searchId = data.searchId;
              }
              params.success({ rowData: data.rows ?? [], rowCount: lastRow });
            } catch (error) {
              console.error("Error fetching data:", error);
              params.fail();
            }
          }
        });
        const dataSource = createDataSource();
        gridApi.setGridOption("serverSideDatasource", dataSource);
        gridApi.refreshServerSide({ purge: true });
      }
    }
    function setDataToSend(data) {
      console.log("setDataToSend called with:", data);
      setDataToSendValue(data);
      console.log("dataToSendRef.current updated to:", dataToSendRef.current);
      if (gridApi && rowModelType === "serverSide" && currentApiUrl) {
        const createDataSource = () => ({
          getRows: async (params) => {
            try {
              const pageSize = params.request.endRow - params.request.startRow;
              const page = Math.floor(params.request.startRow / pageSize) + 1;
              const currentData = getCurrentDataToSend();
              const queryParams = { page, pageSize, ...currentData };
              console.log("Datasource getRows called with queryParams:", queryParams);
              const fullUrl = buildUrlWithParams(apiUrl, queryParams);
              const response = await fetch(fullUrl);
              const responseData = await response.json().catch(() => ({ error: "Erreur lors de la récupération des données" }));
              console.log("Response data:", responseData);
              if (!response.ok) {
                console.error("Error fetching data:", responseData);
                if (responseData.error && typeof window !== "undefined") {
                  const message = String(responseData.error);
                  if (message.includes("Toutes les clés API Coresignal sont épuisées")) {
                    toast.error("Vos crédits Coresignal sont épuisés. Ajoutez une nouvelle clé API dans les paramètres.");
                  } else {
                    toast.error(message);
                  }
                }
                params.fail();
                return;
              }
              if (responseData.searchId) {
                dataToSendRef.current.searchId = responseData.searchId;
              }
              let lastRow = -1;
              if (responseData.lastRow !== void 0 && responseData.lastRow !== null) {
                const parsed = typeof responseData.lastRow === "number" ? responseData.lastRow : Number(responseData.lastRow);
                lastRow = !isNaN(parsed) && parsed >= 0 ? parsed : -1;
              }
              params.success({ rowData: responseData.rows ?? [], rowCount: lastRow });
            } catch (error) {
              console.error("Error fetching data:", error);
              params.fail();
            }
          }
        });
        const newDataSource = createDataSource();
        console.log("Setting new datasource");
        gridApi.setGridOption("serverSideDatasource", newDataSource);
      }
    }
    function getDataToSend() {
      return dataToSendRef.current;
    }
    function getGridApi() {
      return gridApi;
    }
    function selectAll() {
      gridApi?.selectAll();
    }
    function getSelectedRows() {
      return gridApi?.getSelectedRows() ?? [];
    }
    function exportToCSV() {
      gridApi?.exportDataAsCsv();
    }
    AgGrid($$renderer2, {
      gridOptions: mergedOptions(),
      gridStyle
    });
    bind_props($$props, {
      setLoading,
      clearSelection,
      setApiUrl,
      setDataToSend,
      getDataToSend,
      getGridApi,
      selectAll,
      getSelectedRows,
      exportToCSV
    });
  });
}
function OfferSheet($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      offer,
      contacts,
      isLinkedInEnabled = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = $$props;
    let deliveryChannel = "linkedin";
    let messages = {};
    let generatingFor = null;
    let generatingAll = false;
    let savingFor = null;
    let scraping = false;
    let enrichingFor = null;
    let enrichingAll = false;
    const unenrichedCount = derived(() => contacts.filter((c) => c.linkedinUrl && !c.linkedinData).length);
    const linkedinCharLimit = 300;
    function getProfilePicture(contact) {
      const profile = contact.linkedinData ?? null;
      return profile?.profile_picture_url || profile?.picture_url || profile?.photo_url || null;
    }
    function getInitial(name) {
      return name?.charAt(0).toUpperCase() || "?";
    }
    const statusLabels = {
      to_contact: { label: "À contacter", color: "#d1d5db" },
      contacted: { label: "Contacté", color: "#93c5fd" },
      contacted_linkedin: { label: "LinkedIn", color: "#0a66c2" },
      contacted_whatsapp: { label: "WhatsApp", color: "#25d366" },
      contacted_email: { label: "Email", color: "#2563eb" },
      replied: { label: "Répondu", color: "#16a34a" },
      closed: { label: "Fermé", color: "#ef4444" }
    };
    const contactsWithMessages = derived(() => contacts.filter((c) => messages[c.id] !== void 0 && messages[c.id].trim() !== ""));
    $$renderer2.push(`<div class="fixed inset-0 bg-black/40 z-40" role="button" tabindex="-1"></div> <div class="fixed right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden"><div class="flex items-start justify-between px-6 py-5 border-b border-border bg-card flex-shrink-0"><div class="flex-1 min-w-0 space-y-1"><div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">${escape_html(offer.companyName)}</span> `);
    if (offer.offerLocation) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="flex items-center gap-1 text-xs text-muted-foreground"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg> ${escape_html(offer.offerLocation)}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <h2 class="text-lg font-bold text-foreground leading-snug">`);
    if (offer.offerUrl) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<a${attr("href", offer.offerUrl)} target="_blank" rel="noopener noreferrer" class="hover:text-indigo-600 hover:underline transition-colors inline-flex items-center gap-1.5">${escape_html(offer.offerTitle || offer.offerUrl)} <svg class="w-4 h-4 flex-shrink-0 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`${escape_html(offer.offerTitle || offer.companyName)}`);
    }
    $$renderer2.push(`<!--]--></h2> <div class="flex items-center gap-2 mt-1"><p class="text-sm text-muted-foreground">${escape_html(contacts.length)} contact${escape_html(contacts.length !== 1 ? "s" : "")}</p> `);
    if (offer.offerUrl) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button${attr("disabled", scraping, true)} class="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-input rounded-md hover:bg-accent disabled:opacity-50 transition-colors text-muted-foreground" title="Extraire le titre et la localisation depuis l'URL de l'offre">`);
      {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg> Scraper l'offre`);
      }
      $$renderer2.push(`<!--]--></button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div> <button aria-label="Fermer" class="ml-4 p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> `);
    if (unenrichedCount() > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex items-center gap-3 px-6 py-2.5 border-b border-blue-100 bg-blue-50 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path></svg> <p class="text-xs text-blue-700 flex-1"><span class="font-semibold">${escape_html(unenrichedCount())} profil${escape_html(unenrichedCount() > 1 ? "s" : "")}</span> non enrichi${escape_html(unenrichedCount() > 1 ? "s" : "")} `);
      if (!isLinkedInEnabled) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`— <span class="italic">Connectez LinkedIn dans les paramètres pour enrichir</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></p> `);
      if (isLinkedInEnabled) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button${attr("disabled", enrichingAll, true)} class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0a66c2] text-white rounded-md hover:bg-[#004182] disabled:opacity-50 transition-colors">`);
        {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`Enrichir tous les profils`);
        }
        $$renderer2.push(`<!--]--></button>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap"><div class="inline-flex border border-border rounded-full overflow-hidden text-xs"><!--[-->`);
    const each_array = ensure_array_like([
      ["linkedin", "LinkedIn"],
      ["whatsapp", "WhatsApp"],
      ["email", "Email"]
    ]);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let [ch, label] = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr_class(`px-3 py-1.5 transition-colors ${stringify(deliveryChannel === ch ? "bg-indigo-600 text-white" : "text-muted-foreground hover:bg-accent")}`)}>${escape_html(label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-1"></div> <button${attr("disabled", contacts.length === 0, true)} class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13.09 8.26L19 6L14.74 10.91L21 12L14.74 13.09L19 18L13.09 15.74L12 22L10.91 15.74L5 18L9.26 13.09L3 12L9.26 10.91L5 6L10.91 8.26L12 2Z"></path></svg> Générer tous les messages`);
    }
    $$renderer2.push(`<!--]--></button></div> <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">`);
    if (contacts.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm"><p>Aucun contact pour cette offre</p></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_1 = ensure_array_like(contacts);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let contact = each_array_1[$$index_1];
        const pic = getProfilePicture(contact);
        const name = contact.fullName || contact.email || contact.linkedinUrl || "Contact";
        const status = statusLabels[contact.contactStatus || "to_contact"] || statusLabels.to_contact;
        const msg = messages[contact.id];
        const isGenerating = generatingFor === contact.id;
        const isSaving = savingFor === contact.id;
        const isEnriching = enrichingFor === contact.id;
        const needsEnrich = !!contact.linkedinUrl && !contact.linkedinData;
        $$renderer2.push(`<div class="border border-border rounded-xl overflow-hidden"><div class="flex items-center gap-3 px-4 py-3 bg-muted/20"><div class="flex-shrink-0">`);
        if (pic) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<img${attr("src", `/api/image-proxy?url=${stringify(encodeURIComponent(pic))}`)}${attr("alt", name)} class="w-10 h-10 rounded-full object-cover border border-border"/>`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">${escape_html(getInitial(name))}</div>`);
        }
        $$renderer2.push(`<!--]--></div> <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-medium text-sm text-foreground">${escape_html(name)}</span> <span class="inline-block w-2 h-2 rounded-full flex-shrink-0"${attr_style(`background-color: ${stringify(status.color)}`)}${attr("title", status.label)}></span></div> `);
        if (contact.jobTitle) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-xs text-muted-foreground truncate">${escape_html(contact.jobTitle)}</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-1.5 flex-shrink-0">`);
        if (contact.linkedinUrl) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<a${attr("href", contact.linkedinUrl)} target="_blank" rel="noopener noreferrer" class="p-1.5 rounded hover:bg-accent transition-colors" title="Profil LinkedIn"><svg width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path></svg></a>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (needsEnrich && isLinkedInEnabled) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<button${attr("disabled", isEnriching || enrichingAll, true)} class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors" title="Enrichir le profil LinkedIn">`);
          if (isEnriching) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`);
          }
          $$renderer2.push(`<!--]--> Enrichir</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <button${attr("disabled", isGenerating || generatingAll, true)} class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-input rounded-md hover:bg-accent disabled:opacity-50 transition-colors" title="Générer un message IA">`);
        if (isGenerating) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<svg width="11" height="11" viewBox="0 0 24 24" fill="#6366f1"><path d="M12 2L13.09 8.26L19 6L14.74 10.91L21 12L14.74 13.09L19 18L13.09 15.74L12 22L10.91 15.74L5 18L9.26 13.09L3 12L9.26 10.91L5 6L10.91 8.26L12 2Z"></path></svg>`);
        }
        $$renderer2.push(`<!--]--> ${escape_html(msg !== void 0 ? "Regénérer" : "Générer")}</button></div></div> <div class="px-4 py-3 space-y-2">`);
        if (msg !== void 0) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<textarea${attr("rows", 5)}${attr("maxlength", linkedinCharLimit)} class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Le message apparaîtra ici…">`);
          const $$body = escape_html(msg);
          if ($$body) {
            $$renderer2.push(`${$$body}`);
          }
          $$renderer2.push(`</textarea> <div class="flex items-center justify-between">`);
          {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span${attr_class(`text-xs ${stringify(msg.length > linkedinCharLimit ? "text-red-600 font-medium" : "text-muted-foreground")}`)}>${escape_html(msg.length)}/300</span>`);
          }
          $$renderer2.push(`<!--]--> <button${attr("disabled", isSaving, true)} class="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">${escape_html(isSaving ? "Sauvegarde…" : "Sauvegarder")}</button></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<p class="text-xs text-muted-foreground italic py-1">Cliquez sur "Générer" pour créer un message personnalisé pour ce contact.</p>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-shrink-0 border-t border-border px-6 py-4 bg-white flex items-center justify-between gap-4"><div class="text-sm text-muted-foreground">`);
    if (contactsWithMessages().length > 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<span class="text-green-700 font-medium">${escape_html(contactsWithMessages().length)} message${escape_html(contactsWithMessages().length > 1 ? "s" : "")} prêt${escape_html(contactsWithMessages().length > 1 ? "s" : "")}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span>Générez des messages pour pouvoir envoyer</span>`);
    }
    $$renderer2.push(`<!--]--></div> <button${attr("disabled", contactsWithMessages().length === 0, true)} class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`);
      if (contactsWithMessages().length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`Envoyer à ${escape_html(contactsWithMessages().length)} contact${escape_html(contactsWithMessages().length > 1 ? "s" : "")}`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`Envoyer`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></button></div></div>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let list = data.list;
    let offers = [...data.offers];
    let contacts = [...data.contacts];
    let contactsByOffer = { ...data.contactsByOffer };
    let selectedOfferForSheet = null;
    let showOfferSheet = false;
    let quickFilter = "";
    const isLinkedInEnabled = derived(() => !!data.userProfile?.unipileLinkedInAccountId);
    const offersWithCount = derived(() => offers.map((o) => ({ ...o, contactCount: (contactsByOffer[o.id] || []).length })));
    const selectedOfferContacts = derived(() => selectedOfferForSheet ? contactsByOffer[selectedOfferForSheet.id] || [] : []);
    function getColumnDefs() {
      return [
        {
          field: "companyName",
          headerName: "Entreprise",
          width: 200,
          pinned: "left",
          cellRenderer: (params) => {
            const name = params.value;
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.height = "100%";
            div.style.gap = "10px";
            const avatar = document.createElement("div");
            avatar.style.width = "32px";
            avatar.style.height = "32px";
            avatar.style.borderRadius = "8px";
            avatar.style.background = "linear-gradient(135deg, #6366f1, #8b5cf6)";
            avatar.style.display = "flex";
            avatar.style.alignItems = "center";
            avatar.style.justifyContent = "center";
            avatar.style.color = "white";
            avatar.style.fontWeight = "700";
            avatar.style.fontSize = "0.8rem";
            avatar.style.flexShrink = "0";
            avatar.textContent = (name || "?")[0].toUpperCase();
            div.appendChild(avatar);
            const nameEl = document.createElement("span");
            nameEl.style.fontWeight = "600";
            nameEl.style.fontSize = "0.875rem";
            nameEl.textContent = name || "—";
            div.appendChild(nameEl);
            return div;
          }
        },
        {
          field: "offerTitle",
          headerName: "Intitulé du poste",
          flex: 1,
          minWidth: 200,
          cellRenderer: (params) => {
            const title = params.value;
            const offerUrl = params.data?.offerUrl;
            if (!title && !offerUrl) {
              const span2 = document.createElement("span");
              span2.style.color = "#9ca3af";
              span2.style.fontStyle = "italic";
              span2.style.fontSize = "0.8125rem";
              span2.textContent = "—";
              return span2;
            }
            if (offerUrl) {
              const link = document.createElement("a");
              link.href = offerUrl;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.onclick = (e) => e.stopPropagation();
              link.style.display = "inline-flex";
              link.style.alignItems = "center";
              link.style.gap = "5px";
              link.style.color = "#4f46e5";
              link.style.fontWeight = "500";
              link.style.fontSize = "0.875rem";
              link.style.textDecoration = "none";
              link.style.maxWidth = "100%";
              link.style.overflow = "hidden";
              link.style.textOverflow = "ellipsis";
              link.style.whiteSpace = "nowrap";
              const textSpan = document.createElement("span");
              textSpan.textContent = title || offerUrl;
              textSpan.style.overflow = "hidden";
              textSpan.style.textOverflow = "ellipsis";
              textSpan.style.whiteSpace = "nowrap";
              link.appendChild(textSpan);
              const icon = document.createElement("span");
              icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>`;
              link.appendChild(icon);
              link.addEventListener("mouseenter", () => {
                link.style.textDecoration = "underline";
              });
              link.addEventListener("mouseleave", () => {
                link.style.textDecoration = "none";
              });
              return link;
            }
            const span = document.createElement("span");
            span.style.fontWeight = "500";
            span.style.fontSize = "0.875rem";
            span.textContent = title || "—";
            return span;
          }
        },
        {
          field: "offerLocation",
          headerName: "Localisation",
          width: 160,
          cellRenderer: (params) => {
            const loc = params.value;
            if (!loc) {
              const span2 = document.createElement("span");
              span2.style.color = "#9ca3af";
              span2.style.fontSize = "0.8125rem";
              span2.textContent = "—";
              return span2;
            }
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "5px";
            div.innerHTML = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#6b7280"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>`;
            const span = document.createElement("span");
            span.style.fontSize = "0.8125rem";
            span.style.color = "#374151";
            span.textContent = loc;
            div.appendChild(span);
            return div;
          }
        },
        {
          field: "contactCount",
          headerName: "Contacts",
          width: 100,
          sortable: true,
          filter: false,
          resizable: false,
          cellRenderer: (params) => {
            const count = params.value;
            const span = document.createElement("span");
            span.style.display = "inline-flex";
            span.style.alignItems = "center";
            span.style.justifyContent = "center";
            span.style.width = "28px";
            span.style.height = "20px";
            span.style.borderRadius = "9999px";
            span.style.background = count > 0 ? "#ede9fe" : "#f3f4f6";
            span.style.color = count > 0 ? "#6d28d9" : "#6b7280";
            span.style.fontSize = "0.75rem";
            span.style.fontWeight = "600";
            span.textContent = String(count);
            return span;
          }
        },
        {
          headerName: "",
          width: 52,
          sortable: false,
          filter: false,
          resizable: false,
          suppressMovable: true,
          cellRenderer: (params) => {
            const offerUrl = params.data?.offerUrl;
            if (!offerUrl) return "";
            const btn = document.createElement("button");
            btn.title = "Re-scraper l'URL pour extraire titre et localisation";
            btn.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid #e5e7eb;background:transparent;cursor:pointer;transition:background 0.15s;";
            btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
            btn.addEventListener("mouseenter", () => {
              btn.style.background = "#f3f4f6";
            });
            btn.addEventListener("mouseleave", () => {
              btn.style.background = "transparent";
            });
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              handleScrapeRow(params.data?.id);
            });
            return btn;
          }
        }
      ];
    }
    let scrapingOfferId = null;
    async function handleScrapeRow(offerId) {
      if (!offerId || scrapingOfferId) return;
      scrapingOfferId = offerId;
      try {
        const result = await scrapeOffer(offerId);
        if (result) {
          updateOffer(result);
          toast.success("Titre et localisation extraits !");
        } else {
          toast.error("Impossible d'extraire les informations depuis cette URL");
        }
      } catch {
        toast.error("Erreur lors du scraping");
      } finally {
        scrapingOfferId = null;
      }
    }
    const gridOptions = {
      defaultColDef: { resizable: true, sortable: true, filter: true },
      columnDefs: getColumnDefs(),
      rowHeight: 52,
      rowClass: "cursor-pointer",
      onRowClicked: handleRowClicked
    };
    function handleRowClicked(event) {
      const target = event.event?.target;
      if (target?.closest("a")) return;
      const offer = offers.find((o) => o.id === event.data?.id);
      if (offer) {
        selectedOfferForSheet = offer;
        showOfferSheet = true;
      }
    }
    async function scrapeOffer(offerId) {
      const res = await fetch(`/api/offers/${offerId}/scrape`, { method: "POST" });
      if (!res.ok) return null;
      return await res.json();
    }
    function updateOffer(updated) {
      offers = offers.map((o) => o.id === updated.id ? { ...o, ...updated } : o);
      if (selectedOfferForSheet?.id === updated.id) {
        selectedOfferForSheet = { ...selectedOfferForSheet, ...updated };
      }
    }
    let gridHeight = 500;
    const totalContacts = derived(() => contacts.length);
    $$renderer2.push(`<div class="main-layout svelte-3265l6"><div class="header-bar svelte-3265l6"><div class="flex items-center gap-3 min-w-0"><a href="/" class="text-muted-foreground hover:text-foreground text-sm flex-shrink-0">← Accueil</a> <span class="text-muted-foreground">/</span> <h1 class="text-base font-semibold truncate">${escape_html(list.name)}</h1> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-3 flex-shrink-0"><span class="text-sm text-muted-foreground">${escape_html(offers.length)} offre${escape_html(offers.length !== 1 ? "s" : "")} · ${escape_html(totalContacts())} contact${escape_html(totalContacts() !== 1 ? "s" : "")}</span> <button class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md text-sm hover:bg-accent transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Importer Excel</button></div></div> `);
    if (list.pitch) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="px-6 py-2 bg-indigo-50 border-b border-indigo-100"><p class="text-sm text-indigo-700"><span class="font-medium">Pitch :</span> ${escape_html(list.pitch)}</p></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="toolbar-bar svelte-3265l6"><input type="text"${attr("value", quickFilter)} placeholder="Rechercher une offre ou entreprise…" class="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-64"/> <span class="text-xs text-muted-foreground">Cliquez sur une ligne pour voir les contacts et générer les messages</span></div> `);
    if (offers.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-muted-foreground px-6"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-4 opacity-30"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg> <p class="text-base font-medium mb-2">Aucune offre</p> <p class="text-sm mb-4">Importez un fichier Excel pour commencer</p> <button class="px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-md text-sm font-medium transition-colors">Importer Excel</button></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="grid-container svelte-3265l6"${attr_style(`height: ${stringify(gridHeight)}px;`)}>`);
      AgGrid_1($$renderer2, {
        rowData: offersWithCount(),
        gridOptions,
        quickFilterText: quickFilter,
        gridStyle: "height: 100%;"
      });
      $$renderer2.push(`<!----> <button class="resize-handle svelte-3265l6" type="button" aria-label="Redimensionner la grille"></button></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (showOfferSheet && selectedOfferForSheet) {
      $$renderer2.push("<!--[0-->");
      OfferSheet($$renderer2, {
        offer: selectedOfferForSheet,
        contacts: selectedOfferContacts(),
        isLinkedInEnabled: isLinkedInEnabled()
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
