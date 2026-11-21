// Application formatting and domain labels. Every visual primitive is supplied by Imago.
import { avatarHtml } from '@acaprino/imago/ui';
import { harnessInitials } from './model.ts';
export {
 escapeHtml as esc, iconHtml as icon, spinnerHtml as spin, initialsAvatarHtml as sym,
 chipHtml as tag, buttonHtml as button, pageHeadingHtml as head, emptyStateHtml as empty,
 switchHtml as sw, segmentedHtml as seg, textFieldHtml as field,
} from '@acaprino/imago/ui';

export const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
/** The label mapping belongs to the domain; avatar rendering belongs to Imago. */
export const mark=(harness:string)=>avatarHtml(harnessInitials[harness]||harness.slice(0,2).toUpperCase());
/** A stamp the service wrote, in epoch seconds (10 digits) or milliseconds (13), as milliseconds; null for anything else. */
const stamp=(value:unknown)=>{const s=String(value??'');return /^\d{10}(\d{3})?$/.test(s)?Number(s)*(s.length===10?1000:1):null;};
/** The service stamps some events in epoch seconds: shown as a date, anything else as it came. */
export const when=(value:unknown)=>{const ms=stamp(value);return ms===null?String(value??''):new Date(ms).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});};
/** How long ago a stamp was at `now` (milliseconds): "45 s", "2 min 5 s", "1 h 2 min"; empty when the value is no stamp, and never negative. */
export const elapsed=(value:unknown,now:number)=>{const ms=stamp(value);if(ms===null)return '';const s=Math.max(0,Math.floor((now-ms)/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h} h ${m} min`:m?`${m} min ${s%60} s`:`${s} s`;};
