import { panelStateHtml, type PanelStateMarkup } from '@acaprino/imago/ui';

/** A panel that is reading: nothing under LOADING_DELAY_MS (`shown` is `state.slow`), then the package's loading layer (flat bars at the size of what will come), never a spinner in place of the panel. */
export const loadingPanel=(shown:boolean,rows=3)=>`<section class="im-panel" aria-busy="true"><div class="im-panel-body">${shown?panelStateHtml({kind:'loading',rows}):''}</div></section>`;
/** A panel that could not be read: one sentence on what failed and a Retry, inside the panel that failed. */
export const failedPanel=(text:string,retryHtml:string)=>`<section class="im-panel"><div class="im-panel-body">${panelStateHtml({kind:'error',text,retryHtml}satisfies PanelStateMarkup)}</div></section>`;
