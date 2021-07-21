// Inspired by https://codemirror.net/6/examples/bundle/
import { nodeResolve } from '@rollup/plugin-node-resolve';
export default {
  input: './src/example.js',
  output: {
    file: './build/bundle.js',
    format: 'iife',
  },
  plugins: [nodeResolve()],
};
