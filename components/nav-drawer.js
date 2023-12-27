import {animate, fadeIn, fadeOut} from '@lit-labs/motion';
import {LitElement, css, html, nothing} from 'lit'
import {EASING} from '@material/web/internal/motion/animation.js';
import {effect} from '@preact/signals-core';
import {drawerOpenSignal} from '../signals'


export class NavDrawer extends LitElement {
  static properties = {
    isCollapsible: {
      type: Boolean,
      default: false
    }
  }

  lastDrawerOpen = drawerOpenSignal.value;

  performUpdate() {
    if(!this.isUpdatePending) {
      return;
    }
    let performingUpdate = true;
    effect(() => {
      if(performingUpdate) {
	performingUpdate = false;
	super.performUpdate();
      } else {
	this.requestUpdate();
      }
    });
  }

  //const lastDrawerOpen = drawerOpenSignal.value;
  
  static styles = css`
     :host {
       --_drawer-width: var(--catalog-drawer-width, 300px);
       /* When in wide mode inline start margin is handled by the sidebar */
       --_pane-margin-inline-start: 0px;
       --_pane-margin-inline-end: var(--catalog-spacing-l);
       --_pane-margin-block-end: var(--catalog-spacing-l);
       --_toc-pane-width: 250px;
       min-height: 100dvh;
       display: flex;
       flex-direction: column;
     }
 
     ::slotted(nav) {
       list-style: none;
     }
     .body {
       display: flex;
       flex-grow: 1;
     }
 
     .spacer {
       position: relative;
       transition: min-width 0.5s cubic-bezier(0.3, 0, 0, 1);
     }
 
     .spacer,
     aside {
       min-width: var(--_drawer-width);
       max-width: var(--_drawer-width);
     }
     .pane {
       box-sizing: border-box;
       overflow: auto;
       width: 100%;
       /* Explicit height to make overflow work */
       height: calc(
         100dvh - var(--catalog-top-app-bar-height) -
           var(--_pane-margin-block-end)
       );
       background-color: var(--md-sys-color-surface);
       border-radius: var(--catalog-shape-xl);
     }
 
     .pane,
     .panes {
       /* emphasized – duration matching render fn for sidebar */
       transition: 0.5s cubic-bezier(0.3, 0, 0, 1);
       transition-property: margin, height, border-radius, max-width, width;
     } 
     .panes {
       display: flex;
       justify-content: start;
       flex-direction: row-reverse;
       gap: var(--_pane-margin-inline-end);
       margin-inline: var(--_pane-margin-inline-start)
         var(--_pane-margin-inline-end);
       width: 100%;
       max-width: calc(
         100% - var(--_drawer-width) - var(--_pane-margin-inline-start) -
           var(--_pane-margin-inline-end)
       );
     }
 
     .pane.content-pane {
       flex-grow: 1;
     }
     .pane.toc {
       width: auto;
       box-sizing: border-box;
       width: var(--_toc-pane-width);
     }
 
     .toc .scroll-wrapper {
       padding-inline: var(--catalog-spacing-xl);
     }
 
     .pane.toc p {
       margin-block: 0;
       font-size: var(--catalog-label-s-font-size);
     }
 
     .pane.toc h2 {
       margin-block: var(--catalog-spacing-s) var(--catalog-spacing-m);
       font-size: var(--catalog-headline-s-font-size);
     }
     .content {
       flex-grow: 1;
       display: flex;
       justify-content: center;
       box-sizing: border-box;
       padding-inline: var(--catalog-spacing-xl);
       width: 100%;
     }
 
     .content slot {
       display: block;
       width: 100%;
       max-width: min(100%, var(--_max-width));
     }
     aside {
       transition: transform 0.5s cubic-bezier(0.3, 0, 0, 1);
       position: fixed;
       isolation: isolate;
       inset: var(--catalog-top-app-bar-height) 0 0 0;
       z-index: 12;
       background-color: var(--md-sys-color-surface-container);
       overflow: hidden;
     }
 
     .scroll-wrapper {
       overflow-y: auto;
       max-height: 100%;
       border-radius: inherit;
       box-sizing: border-box;
     }
 
     .pane .scroll-wrapper {
       padding-block: var(--catalog-spacing-xl);
     }
     aside slot {
       display: block;
     }
 
     .scrim {
       background-color: rgba(0, 0, 0, 0.32);
     }
 
     @media (max-width: 900px) {
       .pane.toc {
         display: none;
       }
     }

     @media (max-width: 1500px) {
       .spacer {
         min-width: 0px;
       }
 
       .panes {
         max-width: calc(
           100% - var(--_pane-margin-inline-start) -
             var(--_pane-margin-inline-end)
         );
       }
 
       .content {
         max-width: 100vw;
         padding-inline: var(--catalog-spacing-xl);
       }
 
       .scrim {
         position: fixed;
         inset: 0;
       }
       aside {
         transition: unset;
         transform: translateX(-100%);
         border-radius: 0 var(--catalog-shape-xl) var(--catalog-shape-xl) 0;
       }
 
       :host {
         --_pane-margin-inline-start: var(--catalog-spacing-xl);
       }
 
       .open aside {
         transform: translateX(0);
       }
 
       aside slot {
         opacity: 0;
       }
 
       .open aside slot {
         opacity: 1;
       }
       .open .scrim {
         inset: 0;
         z-index: 11;
       }
     }
 
     @media (max-width: 600px) {
       .pane {
         border-end-start-radius: 0;
         border-end-end-radius: 0;
       }
 
       :host {
         --_pane-margin-block-end: 0px;
         --_pane-margin-inline-start: 0px;
         --_pane-margin-inline-end: 0px;
       }
     }
     /* On desktop, make the scrollbars less blocky so you can see the border
      * radius of the pane. On most mobile platforms, these scrollbars are       hidden
      * by default. It'll still unfortunately render on top of the border        radius.
      */
     @media (pointer: fine) {
       :host {
         --_scrollbar-width: 8px;
       }
 
       .scroll-wrapper {
         /* firefox */
         scrollbar-color: var(--md-sys-color-primary) transparent;
         scrollbar-width: thin;
       }

       .content {
         /* adjust for the scrollbar width */
         padding-inline-end: calc(
           var(--catalog-spacing-xl) - var(--_scrollbar-width)
         );
       }
 
       /* Chromium + Safari */
       .scroll-wrapper::-webkit-scrollbar {
         background-color: transparent;
         width: var(--_scrollbar-width);
       }
 
       .scroll-wrapper::-webkit-scrollbar-thumb {
         background-color: var(--md-sys-color-primary);
         border-radius: calc(var(--_scrollbar-width) / 2);
       }
     }
     @media (forced-colors: active) {
       .pane {
         border: 1px solid CanvasText;
       }
 
       @media (max-width: 1500px) {
         aside {
           box-sizing: border-box;
           border: 1px solid CanvasText;
         }
 
         .scrim {
           background-color: rgba(0, 0, 0, 0.75);
         }
       }
       @media (pointer: fine) {
         .scroll-wrapper {
           /* firefox */
           scrollbar-color: CanvasText transparent;
         }
 
         .scroll-wrapper::-webkit-scrollbar-thumb {
           /* Chromium + Safari */
           background-color: CanvasText;
         }
       }
     }
    
  `
  
  constructor() {
    super()
  }

  render() {
    const showModal = this.isCollapsible && drawerOpenSignal.value;

    // Values taken from internal material motion spec
    const drawerSlideAnimationDuration = showModal ? 500 : 150;
    const drawerContentOpacityDuration = showModal ? 300 : 150;
    const scrimOpacityDuration = 150;
    
    const drawerSlideAnimationEasing = showModal
	  ? EASING.EMPHASIZED
	  : EASING.EMPHASIZED_ACCELERATE;
    
    return html`
      <div class="root">
	<slot name="top-app-bar"></slot>
	<div class="body ${drawerOpenSignal.value ? 'open' : ''}">
	  <div class="spacer">
${showModal ? html`<div class="scrim"
    ${animate({
      properties: ['opacity'],
      keyframeOptions: {
	duration: scrimOpacityDuration,
	easing: 'linear',
      },
	in: fadeIn,
      out: fadeOut
    })}
    @click=${this.onScrimClick}></div>` : nothing}
	    <aside
${animate({
properties: ['transform'],
keyframeOptions: {
duration: drawerSlideAnimationDuration,
easing: drawerSlideAnimationEasing
}
})}
?inert=${this.isCollapsible && !drawerOpenSignal.value}>
	      <div class="scroll-wrapper">
		<slot ${animate({properties: ['opacity'], keyframeOptions: {duration: drawerContentOpacityDuration, easing: 'linear'}})}></slot>
	      </div>
	    </aside>
	  </div>
	  <div class="panes">
	    <div class="pane content-pane" ?inert=${showModal}>
	      <div class="scroll-wrapper">
		<div class="content">
		  <slot name="app-content"></slot>
		</div>
	      </div>
	    </div>
	  </div>
	</div>
      </div>
    `
  }
}

customElements.define('nav-drawer', NavDrawer);
