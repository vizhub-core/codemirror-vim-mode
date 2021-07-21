// First iteration by Ben Hormann
// From https://github.com/codemirror/codemirror.next/issues/79#issuecomment-883750175

import { keymap } from '@codemirror/view';
import {
  cursorCharLeft,
  cursorLineDown,
  cursorLineUp,
  cursorCharRight,
} from '@codemirror/commands';

export const vimMode = () =>
  keymap.of([
    { key: 'h', run: cursorCharLeft },
    { key: 'j', run: cursorLineDown },
    { key: 'k', run: cursorLineUp },
    { key: 'l', run: cursorCharRight },
  ]);
