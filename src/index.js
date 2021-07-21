// First iteration by Ben Hormann
// From https://github.com/codemirror/codemirror.next/issues/79#issuecomment-883750175

import { keymap, EditorView } from '@codemirror/view';
import { EditorState, StateEffectType, StateField } from '@codemirror/state';
import * as cmds from '@codemirror/commands';

const vimify = (cmd) => (view) => cmds[`cursor${cmd}`](view);

export const vimMode = () =>
  keymap.of([
    { key: 'h', run: vimify('CharLeft') },
    { key: 'j', run: vimify('LineDown') },
    { key: 'k', run: vimify('LineUp') },
    { key: 'l', run: vimify('CharRight') },
  ]);
