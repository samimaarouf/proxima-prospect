import "clsx";
import { a as attr_class, c as clsx, b as attr, e as ensure_array_like, h as hasContext, g as getContext, s as setContext, d as attr_style, f as spread_props, i as derived, j as stringify, k as attributes, r as run } from "../../chunks/index3.js";
import { c as cn, t as toastState, S as SonnerState } from "../../chunks/toast-state.svelte.js";
import { e as escape_html } from "../../chunks/escaping.js";
const bars = Array(12).fill(0);
function Loader($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { visible, class: className } = $$props;
    $$renderer2.push(`<div${attr_class(clsx(["sonner-loading-wrapper", className].filter(Boolean).join(" ")))}${attr("data-visible", visible)}><div class="sonner-spinner"><!--[-->`);
    const each_array = ensure_array_like(bars);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      each_array[i];
      $$renderer2.push(`<div class="sonner-loading-bar"></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
const defaultWindow = void 0;
function getActiveElement(document2) {
  let activeElement = document2.activeElement;
  while (activeElement?.shadowRoot) {
    const node = activeElement.shadowRoot.activeElement;
    if (node === activeElement)
      break;
    else
      activeElement = node;
  }
  return activeElement;
}
function createSubscriber(_) {
  return () => {
  };
}
class ActiveElement {
  #document;
  #subscribe;
  constructor(options = {}) {
    const { window: window2 = defaultWindow, document: document2 = window2?.document } = options;
    if (window2 === void 0) return;
    this.#document = document2;
    this.#subscribe = createSubscriber();
  }
  get current() {
    this.#subscribe?.();
    if (!this.#document) return null;
    return getActiveElement(this.#document);
  }
}
new ActiveElement();
class Context {
  #name;
  #key;
  /**
   * @param name The name of the context.
   * This is used for generating the context key and error messages.
   */
  constructor(name) {
    this.#name = name;
    this.#key = Symbol(name);
  }
  /**
   * The key used to get and set the context.
   *
   * It is not recommended to use this value directly.
   * Instead, use the methods provided by this class.
   */
  get key() {
    return this.#key;
  }
  /**
   * Checks whether this has been set in the context of a parent component.
   *
   * Must be called during component initialisation.
   */
  exists() {
    return hasContext(this.#key);
  }
  /**
   * Retrieves the context that belongs to the closest parent component.
   *
   * Must be called during component initialisation.
   *
   * @throws An error if the context does not exist.
   */
  get() {
    const context = getContext(this.#key);
    if (context === void 0) {
      throw new Error(`Context "${this.#name}" not found`);
    }
    return context;
  }
  /**
   * Retrieves the context that belongs to the closest parent component,
   * or the given fallback value if the context does not exist.
   *
   * Must be called during component initialisation.
   */
  getOr(fallback) {
    const context = getContext(this.#key);
    if (context === void 0) {
      return fallback;
    }
    return context;
  }
  /**
   * Associates the given value with the current component and returns it.
   *
   * Must be called during component initialisation.
   */
  set(context) {
    return setContext(this.#key, context);
  }
}
const sonnerContext = new Context("<Toaster/>");
function isAction(action) {
  return action.label !== void 0;
}
const TOAST_LIFETIME$1 = 4e3;
const GAP$1 = 14;
const TIME_BEFORE_UNMOUNT = 200;
const DEFAULT_TOAST_CLASSES = {
  toast: "",
  title: "",
  description: "",
  loader: "",
  closeButton: "",
  cancelButton: "",
  actionButton: "",
  action: "",
  warning: "",
  error: "",
  success: "",
  default: "",
  info: "",
  loading: ""
};
function Toast($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      toast,
      index,
      expanded,
      invert: invertFromToaster,
      position,
      visibleToasts,
      expandByDefault,
      closeButton: closeButtonFromToaster,
      interacting,
      cancelButtonStyle = "",
      actionButtonStyle = "",
      duration: durationFromToaster,
      descriptionClass = "",
      classes: classesProp,
      unstyled = false,
      loadingIcon,
      successIcon,
      errorIcon,
      warningIcon,
      closeIcon,
      infoIcon,
      defaultRichColors = false,
      swipeDirections: swipeDirectionsProp,
      closeButtonAriaLabel,
      pauseWhenPageIsHidden,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const defaultClasses = { ...DEFAULT_TOAST_CLASSES };
    let mounted = false;
    let removed = false;
    let swiping = false;
    let swipeOut = false;
    let isSwiped = false;
    let offsetBeforeRemove = 0;
    let initialHeight = 0;
    toast.duration || durationFromToaster || TOAST_LIFETIME$1;
    let swipeOutDirection = null;
    const isFront = derived(() => index === 0);
    const isVisible = derived(() => index + 1 <= visibleToasts);
    const toastType = derived(() => toast.type);
    const dismissible = derived(() => toast.dismissible !== void 0 ? toast.dismissible !== false : toast.dismissable !== false);
    const toastClass = derived(() => toast.class || "");
    const toastDescriptionClass = derived(() => toast.descriptionClass || "");
    const heightIndex = derived(() => toastState.heights.findIndex((height) => height.toastId === toast.id) || 0);
    const closeButton = derived(() => toast.closeButton ?? closeButtonFromToaster);
    const coords = derived(() => position.split("-"));
    const toastsHeightBefore = derived(() => toastState.heights.reduce(
      (prev, curr, reducerIndex) => {
        if (reducerIndex >= heightIndex()) return prev;
        return prev + curr.height;
      },
      0
    ));
    const invert = derived(() => toast.invert || invertFromToaster);
    const disabled = derived(() => toastType() === "loading");
    const classes = derived(() => ({ ...defaultClasses, ...classesProp }));
    const offset = derived(() => Math.round(heightIndex() * GAP$1 + toastsHeightBefore()));
    function deleteToast() {
      removed = true;
      offsetBeforeRemove = offset();
      toastState.removeHeight(toast.id);
      setTimeout(
        () => {
          toastState.remove(toast.id);
        },
        TIME_BEFORE_UNMOUNT
      );
    }
    const icon = derived(() => {
      if (toast.icon) return toast.icon;
      if (toastType() === "success") return successIcon;
      if (toastType() === "error") return errorIcon;
      if (toastType() === "warning") return warningIcon;
      if (toastType() === "info") return infoIcon;
      if (toastType() === "loading") return loadingIcon;
      return null;
    });
    function LoadingIcon($$renderer3) {
      if (loadingIcon) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div${attr_class(clsx(cn(classes()?.loader, toast?.classes?.loader, "sonner-loader")))}${attr("data-visible", toastType() === "loading")}>`);
        loadingIcon($$renderer3);
        $$renderer3.push(`<!----></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
        Loader($$renderer3, {
          class: cn(classes()?.loader, toast.classes?.loader),
          visible: toastType() === "loading"
        });
      }
      $$renderer3.push(`<!--]-->`);
    }
    $$renderer2.push(`<li${attr("tabindex", 0)}${attr_class(clsx(cn(restProps.class, toastClass(), classes()?.toast, toast?.classes?.toast, classes()?.[toastType()], toast?.classes?.[toastType()])))}${attr("aria-live", toast.important ? "assertive" : "polite")} aria-atomic="true" data-sonner-toast=""${attr("data-rich-colors", toast.richColors ?? defaultRichColors)}${attr("data-styled", !(toast.component || toast.unstyled || unstyled))}${attr("data-mounted", mounted)}${attr("data-promise", Boolean(toast.promise))}${attr("data-swiped", isSwiped)}${attr("data-removed", removed)}${attr("data-visible", isVisible())}${attr("data-y-position", coords()[0])}${attr("data-x-position", coords()[1])}${attr("data-index", index)}${attr("data-front", isFront())}${attr("data-swiping", swiping)}${attr("data-dismissible", dismissible())}${attr("data-type", toastType())}${attr("data-invert", invert())}${attr("data-swipe-out", swipeOut)}${attr("data-swipe-direction", swipeOutDirection)}${attr("data-expanded", Boolean(expanded || expandByDefault && mounted))}${attr_style(`${restProps.style} ${toast.style}`, {
      "--index": index,
      "--toasts-before": index,
      "--z-index": toastState.toasts.length - index,
      "--offset": `${removed ? offsetBeforeRemove : offset()}px`,
      "--initial-height": expandByDefault ? "auto" : `${initialHeight}px`
    })}>`);
    if (closeButton() && !toast.component && toastType() !== "loading" && closeIcon !== null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button${attr("aria-label", closeButtonAriaLabel)}${attr("data-disabled", disabled())} data-close-button=""${attr_class(clsx(cn(classes()?.closeButton, toast?.classes?.closeButton)))}>`);
      closeIcon?.($$renderer2);
      $$renderer2.push(`<!----></button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (toast.component) {
      $$renderer2.push("<!--[0-->");
      const Component = toast.component;
      if (Component) {
        $$renderer2.push("<!--[-->");
        Component($$renderer2, spread_props([toast.componentProps, { closeToast: deleteToast }]));
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
    } else {
      $$renderer2.push("<!--[-1-->");
      if ((toastType() || toast.icon || toast.promise) && toast.icon !== null && (icon() !== null || toast.icon)) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div data-icon=""${attr_class(clsx(cn(classes()?.icon, toast?.classes?.icon)))}>`);
        if (toast.promise || toastType() === "loading") {
          $$renderer2.push("<!--[0-->");
          if (toast.icon) {
            $$renderer2.push("<!--[0-->");
            if (toast.icon) {
              $$renderer2.push("<!--[-->");
              toast.icon($$renderer2, {});
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          } else {
            $$renderer2.push("<!--[-1-->");
            LoadingIcon($$renderer2);
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (toast.type !== "loading") {
          $$renderer2.push("<!--[0-->");
          if (toast.icon) {
            $$renderer2.push("<!--[0-->");
            if (toast.icon) {
              $$renderer2.push("<!--[-->");
              toast.icon($$renderer2, {});
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          } else if (toastType() === "success") {
            $$renderer2.push("<!--[1-->");
            successIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "error") {
            $$renderer2.push("<!--[2-->");
            errorIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "warning") {
            $$renderer2.push("<!--[3-->");
            warningIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "info") {
            $$renderer2.push("<!--[4-->");
            infoIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div data-content=""${attr_class(clsx(cn(classes()?.content, toast?.classes?.content)))}><div data-title=""${attr_class(clsx(cn(classes()?.title, toast?.classes?.title)))}>`);
      if (toast.title) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast.title !== "string") {
          $$renderer2.push("<!--[0-->");
          const Title = toast.title;
          if (Title) {
            $$renderer2.push("<!--[-->");
            Title($$renderer2, spread_props([toast.componentProps]));
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`${escape_html(toast.title)}`);
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (toast.description) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div data-description=""${attr_class(clsx(cn(descriptionClass, toastDescriptionClass(), classes()?.description, toast.classes?.description)))}>`);
        if (typeof toast.description !== "string") {
          $$renderer2.push("<!--[0-->");
          const Description = toast.description;
          if (Description) {
            $$renderer2.push("<!--[-->");
            Description($$renderer2, spread_props([toast.componentProps]));
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`${escape_html(toast.description)}`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (toast.cancel) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast.cancel === "function") {
          $$renderer2.push("<!--[0-->");
          if (toast.cancel) {
            $$renderer2.push("<!--[-->");
            toast.cancel($$renderer2, {});
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else if (isAction(toast.cancel)) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<button data-button="" data-cancel=""${attr_style(toast.cancelButtonStyle ?? cancelButtonStyle)}${attr_class(clsx(cn(classes()?.cancelButton, toast?.classes?.cancelButton)))}>${escape_html(toast.cancel.label)}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (toast.action) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast.action === "function") {
          $$renderer2.push("<!--[0-->");
          if (toast.action) {
            $$renderer2.push("<!--[-->");
            toast.action($$renderer2, {});
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else if (isAction(toast.action)) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<button data-button=""${attr_style(toast.actionButtonStyle ?? actionButtonStyle)}${attr_class(clsx(cn(classes()?.actionButton, toast?.classes?.actionButton)))}>${escape_html(toast.action.label)}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></li>`);
  });
}
function SuccessIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-success-icon=""><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"></path></svg>`);
}
function ErrorIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-error-icon=""><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"></path></svg>`);
}
function WarningIcon($$renderer) {
  $$renderer.push(`<svg viewBox="0 0 64 64" fill="currentColor" height="20" width="20" data-sonner-warning-icon="" xmlns="http://www.w3.org/2000/svg"><path d="M32.427,7.987c2.183,0.124 4,1.165 5.096,3.281l17.936,36.208c1.739,3.66 -0.954,8.585 -5.373,8.656l-36.119,0c-4.022,-0.064 -7.322,-4.631 -5.352,-8.696l18.271,-36.207c0.342,-0.65 0.498,-0.838 0.793,-1.179c1.186,-1.375 2.483,-2.111 4.748,-2.063Zm-0.295,3.997c-0.687,0.034 -1.316,0.419 -1.659,1.017c-6.312,11.979 -12.397,24.081 -18.301,36.267c-0.546,1.225 0.391,2.797 1.762,2.863c12.06,0.195 24.125,0.195 36.185,0c1.325,-0.064 2.321,-1.584 1.769,-2.85c-5.793,-12.184 -11.765,-24.286 -17.966,-36.267c-0.366,-0.651 -0.903,-1.042 -1.79,-1.03Z"></path><path d="M33.631,40.581l-3.348,0l-0.368,-16.449l4.1,0l-0.384,16.449Zm-3.828,5.03c0,-0.609 0.197,-1.113 0.592,-1.514c0.396,-0.4 0.935,-0.601 1.618,-0.601c0.684,0 1.223,0.201 1.618,0.601c0.395,0.401 0.593,0.905 0.593,1.514c0,0.587 -0.193,1.078 -0.577,1.473c-0.385,0.395 -0.929,0.593 -1.634,0.593c-0.705,0 -1.249,-0.198 -1.634,-0.593c-0.384,-0.395 -0.576,-0.886 -0.576,-1.473Z"></path></svg>`);
}
function InfoIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-info-icon=""><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"></path></svg>`);
}
function CloseIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-sonner-close-icon=""><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`);
}
const VISIBLE_TOASTS_AMOUNT = 3;
const VIEWPORT_OFFSET = "24px";
const MOBILE_VIEWPORT_OFFSET = "16px";
const TOAST_LIFETIME = 4e3;
const TOAST_WIDTH = 356;
const GAP = 14;
const DARK = "dark";
const LIGHT = "light";
function getOffsetObject(defaultOffset, mobileOffset) {
  const styles = {};
  [defaultOffset, mobileOffset].forEach((offset, index) => {
    const isMobile = index === 1;
    const prefix = isMobile ? "--mobile-offset" : "--offset";
    const defaultValue = isMobile ? MOBILE_VIEWPORT_OFFSET : VIEWPORT_OFFSET;
    function assignAll(offset2) {
      ["top", "right", "bottom", "left"].forEach((key) => {
        styles[`${prefix}-${key}`] = typeof offset2 === "number" ? `${offset2}px` : offset2;
      });
    }
    if (typeof offset === "number" || typeof offset === "string") {
      assignAll(offset);
    } else if (typeof offset === "object") {
      ["top", "right", "bottom", "left"].forEach((key) => {
        const value = offset[key];
        if (value === void 0) {
          styles[`${prefix}-${key}`] = defaultValue;
        } else {
          styles[`${prefix}-${key}`] = typeof value === "number" ? `${value}px` : value;
        }
      });
    } else {
      assignAll(defaultValue);
    }
  });
  return styles;
}
function Toaster($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    function getInitialTheme(t) {
      if (t !== "system") return t;
      if (typeof window !== "undefined") {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          return DARK;
        }
        return LIGHT;
      }
      return LIGHT;
    }
    let {
      invert = false,
      position = "bottom-right",
      hotkey = ["altKey", "KeyT"],
      expand = false,
      closeButton = false,
      offset = VIEWPORT_OFFSET,
      mobileOffset = MOBILE_VIEWPORT_OFFSET,
      theme = "light",
      richColors = false,
      duration = TOAST_LIFETIME,
      visibleToasts = VISIBLE_TOASTS_AMOUNT,
      toastOptions = {},
      dir = "auto",
      gap = GAP,
      pauseWhenPageIsHidden = false,
      loadingIcon: loadingIconProp,
      successIcon: successIconProp,
      errorIcon: errorIconProp,
      warningIcon: warningIconProp,
      closeIcon: closeIconProp,
      infoIcon: infoIconProp,
      containerAriaLabel = "Notifications",
      class: className,
      closeButtonAriaLabel = "Close toast",
      onblur,
      onfocus,
      onmouseenter,
      onmousemove,
      onmouseleave,
      ondragend,
      onpointerdown,
      onpointerup,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    function getDocumentDirection() {
      if (dir !== "auto") return dir;
      if (typeof window === "undefined") return "ltr";
      if (typeof document === "undefined") return "ltr";
      const dirAttribute = document.documentElement.getAttribute("dir");
      if (dirAttribute === "auto" || !dirAttribute) {
        run(() => dir = window.getComputedStyle(document.documentElement).direction ?? "ltr");
        return dir;
      }
      run(() => dir = dirAttribute);
      return dirAttribute;
    }
    const possiblePositions = derived(() => Array.from(new Set([
      position,
      ...toastState.toasts.filter((toast) => toast.position).map((toast) => toast.position)
    ].filter(Boolean))));
    let expanded = false;
    let interacting = false;
    let actualTheme = getInitialTheme(theme);
    const hotkeyLabel = derived(() => hotkey.join("+").replace(/Key/g, "").replace(/Digit/g, ""));
    sonnerContext.set(new SonnerState());
    $$renderer2.push(`<section${attr("aria-label", `${stringify(containerAriaLabel)} ${stringify(hotkeyLabel())}`)}${attr("tabindex", -1)} aria-live="polite" aria-relevant="additions text" aria-atomic="false" class="svelte-nbs0zk">`);
    if (toastState.toasts.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(possiblePositions());
      for (let index = 0, $$length = each_array.length; index < $$length; index++) {
        let position2 = each_array[index];
        const [y, x] = position2.split("-");
        const offsetObject = getOffsetObject(offset, mobileOffset);
        $$renderer2.push(`<ol${attributes(
          {
            tabindex: -1,
            dir: getDocumentDirection(),
            class: clsx(className),
            "data-sonner-toaster": true,
            "data-sonner-theme": actualTheme,
            "data-y-position": y,
            "data-x-position": x,
            style: restProps.style,
            ...restProps
          },
          "svelte-nbs0zk",
          void 0,
          {
            "--front-toast-height": `${toastState.heights[0]?.height}px`,
            "--width": `${TOAST_WIDTH}px`,
            "--gap": `${gap}px`,
            "--offset-top": offsetObject["--offset-top"],
            "--offset-right": offsetObject["--offset-right"],
            "--offset-bottom": offsetObject["--offset-bottom"],
            "--offset-left": offsetObject["--offset-left"],
            "--mobile-offset-top": offsetObject["--mobile-offset-top"],
            "--mobile-offset-right": offsetObject["--mobile-offset-right"],
            "--mobile-offset-bottom": offsetObject["--mobile-offset-bottom"],
            "--mobile-offset-left": offsetObject["--mobile-offset-left"]
          }
        )}><!--[-->`);
        const each_array_1 = ensure_array_like(toastState.toasts.filter((toast) => !toast.position && index === 0 || toast.position === position2));
        for (let index2 = 0, $$length2 = each_array_1.length; index2 < $$length2; index2++) {
          let toast = each_array_1[index2];
          {
            let successIcon = function($$renderer3) {
              if (successIconProp) {
                $$renderer3.push("<!--[0-->");
                successIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (successIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                SuccessIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, errorIcon = function($$renderer3) {
              if (errorIconProp) {
                $$renderer3.push("<!--[0-->");
                errorIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (errorIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                ErrorIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, warningIcon = function($$renderer3) {
              if (warningIconProp) {
                $$renderer3.push("<!--[0-->");
                warningIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (warningIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                WarningIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, infoIcon = function($$renderer3) {
              if (infoIconProp) {
                $$renderer3.push("<!--[0-->");
                infoIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (infoIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                InfoIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, closeIcon = function($$renderer3) {
              if (closeIconProp) {
                $$renderer3.push("<!--[0-->");
                closeIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (closeIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                CloseIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            };
            Toast($$renderer2, {
              index: index2,
              toast,
              defaultRichColors: richColors,
              duration: toastOptions?.duration ?? duration,
              class: toastOptions?.class ?? "",
              descriptionClass: toastOptions?.descriptionClass || "",
              invert,
              visibleToasts,
              closeButton,
              interacting,
              position: position2,
              style: toastOptions?.style ?? "",
              classes: toastOptions.classes || {},
              unstyled: toastOptions.unstyled ?? false,
              cancelButtonStyle: toastOptions?.cancelButtonStyle ?? "",
              actionButtonStyle: toastOptions?.actionButtonStyle ?? "",
              closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? closeButtonAriaLabel,
              expandByDefault: expand,
              expanded,
              pauseWhenPageIsHidden,
              loadingIcon: loadingIconProp,
              successIcon,
              errorIcon,
              warningIcon,
              infoIcon,
              closeIcon,
              $$slots: {
                successIcon: true,
                errorIcon: true,
                warningIcon: true,
                infoIcon: true,
                closeIcon: true
              }
            });
          }
        }
        $$renderer2.push(`<!--]--></ol>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></section>`);
  });
}
function _layout($$renderer, $$props) {
  let { children, data } = $$props;
  Toaster($$renderer, { richColors: true, position: "top-right" });
  $$renderer.push(`<!----> `);
  children($$renderer);
  $$renderer.push(`<!---->`);
}
export {
  _layout as default
};
