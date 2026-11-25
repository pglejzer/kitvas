// The editor screen's first paint (ADR 0057 follow-up, plan 18e). The server cannot know the
// person's panel widths and folds or the mode they chose, so it used to draw the left panel
// folded in Preview and let `client/studio/shell/panels.ts` fix that after the scripts loaded:
// the canvas jumped on every load and every version switch. This inline script runs before the
// first paint and applies what `panels.ts` would apply at mount, from the same storage keys and
// the same rules as `client/studio/shell/layout.ts` and `client/studio/edit/select/mode-memory.ts`:
// the remembered mode (only where `main` carries `data-edit-panel`, a version that can be edited),
// each panel's fold and open width (`--side-left`, `--side-right`, `data-folded`, the grip, the
// rail's `aria-expanded` and `aria-pressed`), a narrow window as the panels treat it.
//
// The rules exist twice (here, in a string, and in `layout.ts`); `test/studio/pages/editor/
// first-layout.test.ts` runs this script against a fake page for a table of stored settings,
// modes and window widths and compares it with `layout.ts`, so a change to one fails there.
// Storage that throws or holds junk counts as no setting, as in `readSettings`.

import { type Html, html, trusted } from '../html.ts';

/** `LAYOUT_KEY` of `client/studio/shell/layout.ts`. */
export const LAYOUT_KEY = 'kitvas.editor.layout';
/** The start of `modeKey(slug)` of `client/studio/edit/select/mode-memory.ts`. */
export const MODE_KEY_START = 'kitvas.edit.mode:';

const CODE = `(function(){try{var D=document,M=D.querySelector('main[data-mode]');if(!M)return;
var mode='preview';
try{if(M.hasAttribute('data-edit-panel')&&sessionStorage.getItem('${MODE_KEY_START}'+M.getAttribute('data-draft'))==='edit')mode='edit'}catch(e){}
var S={left:{w:null,f:null},right:{w:null,f:null}};
try{var P=JSON.parse(localStorage.getItem('${LAYOUT_KEY}'));
if(P&&typeof P==='object'){['left','right'].forEach(function(k){var o=P[k];if(!o||typeof o!=='object')return;
var w=o.width;if(typeof w==='number'&&isFinite(w)&&w>=220&&w<=720)S[k].w=Math.round(w);
if(typeof o.folded==='boolean')S[k].f=o.folded})}}catch(e){}
var DW={left:248,right:312},DF=mode==='edit'?{left:false,right:false}:{left:true,right:false};
var V={};['left','right'].forEach(function(k){V[k]={w:S[k].w===null?DW[k]:S[k].w,f:S[k].f===null?DF[k]:S[k].f}});
function C(w,room,other){var a=isFinite(w)?Math.round(w):220;var m=isFinite(room)&&room>0?Math.min(720,Math.floor(room*0.45),room-other-320):720;return Math.max(220,Math.min(a,m))}
var narrow=false;try{narrow=matchMedia('(max-width: 1099.98px)').matches}catch(e){}
var room=innerWidth-102,W;
if(narrow)W={left:V.left.w,right:V.right.w};
else{var l=C(V.left.w,room,V.right.f?52:V.right.w);W={left:l,right:C(V.right.w,room,V.left.f?0:l)}}
M.setAttribute('data-mode',mode);
['left','right'].forEach(function(k){M.style.setProperty('--side-'+k,W[k]+'px');
var a=M.querySelector('aside[data-side="'+k+'"]');
if(a){if(V[k].f)a.setAttribute('data-folded','');else a.removeAttribute('data-folded')}
var g=M.querySelector('[data-grip="'+k+'"]');if(g)g.hidden=V[k].f});
var open=!narrow&&!V.left.f;
var fb=M.querySelector('[data-fold="left"]');if(fb)fb.setAttribute('aria-expanded',String(open));
var lb=M.querySelector('button[data-rail-tab="layers"]');if(lb)lb.setAttribute('aria-pressed',String(open));
var bs=M.querySelectorAll('button[data-shell-mode]');
for(var i=0;i<bs.length;i++)bs[i].setAttribute('aria-pressed',String(bs[i].getAttribute('data-shell-mode')===mode))
}catch(e){}})()`;

/** The script's code, for tests that run it. */
export const OPENING_CODE = CODE;

/**
 * The inline script, on the response's nonce. It goes after the panels and their grips in the
 * document (they are looked up when it runs) and before the first paint.
 */
export function openingLayout(nonce: string): Html {
  return html`<script nonce="${nonce}">${trusted(CODE)}</script>`;
}
