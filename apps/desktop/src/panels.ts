import { panelStateHtml } from '@acaprino/imago/ui';

/** A panel that is reading: the package's loading layer (flat bars at the size of what will come) in a panel body, never a spinner in place of the panel. */
export const loadingPanel=(rows=3)=>`<section class="im-panel" aria-busy="true"><div class="im-panel-body">${panelStateHtml({kind:'loading',rows})}</div></section>`;
