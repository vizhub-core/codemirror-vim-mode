// Inspired by https://codemirror.net/6/examples/bundle/
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { javascript } from '@codemirror/lang-javascript';
import { vimMode } from './index';

const editor = new EditorView({
  state: EditorState.create({
    extensions: [basicSetup, javascript(), vimMode()],
  }),
  parent: document.body,
});
