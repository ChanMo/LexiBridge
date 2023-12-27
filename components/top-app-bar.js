import {LitElement, css, html} from 'lit'
import {drawerOpenSignal} from '../signals'

export class TopAppBar extends LitElement {
  static properties = {
  }
  
  constructor() {
    super()
  }

  onMenuIconToggle(e) {
    drawerOpenSignal.value = !e.target.selected;
  }

  static styles = css`
    :host,
    header {
      display: block;
      height: var(--catalog-top-app-bar-height);
    }

    header {
      position: fixed;
      inset: 0 0 auto 0;
      display: flex;
      align-items: center;
      box-sizing: border-box;
      padding: var(--catalog-spacing-m) var(--catalog-spacing-l);
      background-color: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
      z-index: 12;
    }

    .default-content {
      width: 100%;
      display: flex;
      align-items: center;
    }

    md-icon-button:not(:defined) {
      width: 40px;
      height: 40px;
      display: flex;
      visibility: hidden;
    }

    md-icon-button * {
      display: block;
    }

    a {
      color: var(--md-sys-color-primary);
      font-size: max(var(--catalog-title-l-font-size), 22px);
      text-decoration: none;
      padding-inline: 12px;
      position: relative;
      outline: none;
      vertical-align: middle;
    }

    .start .menu-button {
    display: none;
    }

    .start .home-button * {
      color: var(--md-sys-color-primary);
    }

    #home-link {
    font-weight: 600;
    }

    .end {
      flex-grow: 1;
      display: flex;
      justify-content: flex-end;
    }

    #menu-island {
      position: relative;
    }

    #skip-to-main {
      padding: var(--catalog-spacing-s);
      border-radius: var(--catalog-shape-m);
      background-color: var(--md-sys-color-inverse-surface);
      color: var(--md-sys-color-inverse-on-surface);
      opacity: 0;
      position: absolute;
      pointer-events: none;
    }

    #skip-to-main:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }

    @media (max-width: 1500px) {
      .start .home-button {
        display: none;
      }

      .start .menu-button {
        display: flex;
      }
    }
`;

  render() {
    return html`
      <header>
        <div class="default-content">
          <section class="start">
            <md-icon-button
              toggle
               class="menu-button"
               aria-label-selected="open navigation menu"
               aria-label="close navigation menu"
	       selected=${drawerOpenSignal.value}
	      @input=${this.onMenuIconToggle}
              >
              <md-icon slot="selected">menu</md-icon>
              <md-icon>menu_open</md-icon>
            </md-icon-button>
	    <md-icon-button href="./options.html" class="home-button" title="Home" aria-label="Home">
	      <img src="icon.png" alt="LexiBridge" style="width:24px;height:24px;" />
	    </md-icon-button>
          </section>

          <a href="options.html" id="home-link">LexiBridge</a>

          <a id="skip-to-main" href="#main-content" tabindex="0">
            Skip to main content
          </a>

          <section class="end">
            <md-icon-button
	       href="https://github.com/ChanMo/LexiBridge/issues/"
	       target="_blank"
               title="Bug Report"
               aria-label="but report">
              <md-icon>bug_report</md-icon>
            </md-icon-button>
            <md-icon-button
	       href="https://github.com/ChanMo/LexiBridge/"
	       target="_blank"
               title="Github"
               aria-label="github">
              <md-icon>help</md-icon>
            </md-icon-button>
          </section>
        </div>
        <slot></slot>
      </header>
`
  }  
}

customElements.define('top-app-bar', TopAppBar);
