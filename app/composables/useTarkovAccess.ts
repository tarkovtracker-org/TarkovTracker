import {
  dismissTarkovAccessGate,
  ensureTarkovAccess,
  getTarkovAccessState,
  isTarkovAccessEnabled,
  requestGateRetry,
  reportGateWidgetUnavailable,
  resolveTarkovAccessSiteKey,
  submitGateToken,
  TARKOV_ACCESS_WIDGET_ACTION,
} from '@/utils/tarkovApiFetch';
export interface UseTarkovAccessReturn {
  /** Last known lifecycle phase of the shared access controller. */
  phase: Readonly<Ref<TarkovAccessPhase>>;
  /** Increments per attempt so the widget can reset once per attempt. */
  attemptEpoch: Readonly<Ref<number>>;
  /** True once an attempt consumed its token without releasing access. */
  attemptsExhausted: Readonly<Ref<boolean>>;
  /** True after the first session challenge; it gates the retry-UI visibility. */
  challengeSeen: Readonly<Ref<boolean>>;
  /** True after a dismissal until the next manual retry. */
  dismissed: Readonly<Ref<boolean>>;
  /** Whether the feature gate is active in the public runtime config. */
  accessEnabled: boolean;
  /** True when a site key is available, so an actual widget can be rendered. */
  widgetAvailable: boolean;
  /** The Turnstile action configured for the access gate. */
  widgetAction: string;
  /** The site key the access widget renders with (empty when unavailable). */
  widgetSiteKey: string;
  /** Runs (or joins) the shared probe; fail-fast through nodes see the typed error. */
  probe: (signal?: AbortSignal) => Promise<number>;
  /** Re-runs the access flow; manual only, never automatic. */
  retry: (signal?: AbortSignal) => Promise<void>;
  /** Closes the gate without clearance; callers fail fast until the next manual retry. */
  dismiss: () => void;
  /** Hands a solved widget token to the shared controller (once per attempt). */
  submitToken: (token: string) => void;
  /** Reports that the widget cannot supply a token (script blocked or no key). */
  reportWidgetUnavailable: () => void;
}
/**
 * Reactive view over the shared single-flight Tarkov access controller. The
 * controller itself lives in `tarkovApiFetch.ts` and is shared by every Tarkov
 * metadata request; this composable is only what the access gate UI mounts to.
 */
export function useTarkovAccess(): UseTarkovAccessReturn {
  const state = getTarkovAccessState();
  const widgetSiteKey = resolveTarkovAccessSiteKey();
  return {
    phase: state.phase,
    attemptEpoch: state.attemptEpoch,
    attemptsExhausted: state.attemptsExhausted,
    challengeSeen: state.challengeSeen,
    dismissed: state.dismissed,
    accessEnabled: isTarkovAccessEnabled(),
    widgetSiteKey,
    widgetAvailable: widgetSiteKey.length > 0,
    widgetAction: TARKOV_ACCESS_WIDGET_ACTION,
    probe: (signal?: AbortSignal) => ensureTarkovAccess(signal),
    retry: (signal?: AbortSignal) => requestGateRetry(signal),
    dismiss: () => {
      dismissTarkovAccessGate();
    },
    submitToken: (token: string) => {
      submitGateToken(token);
    },
    reportWidgetUnavailable: () => {
      reportGateWidgetUnavailable();
    },
  };
}
