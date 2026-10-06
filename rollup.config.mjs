import {nodeResolve} from '@rollup/plugin-node-resolve';

// Bundles the Lit / Material Web components used by options.html and blacklist.html.
export default {
  input: 'index.js',
  output: {
    file: 'bundle.js',
    format: 'es',
  },
  plugins: [nodeResolve()],
};
