// First iteration by Ben Hormann
// From https://github.com/codemirror/codemirror.next/issues/79#issuecomment-883750175

import {keymap, EditorView} from '@codemirror/view'
import {EditorState, StateEffectType, StateField} from '@codemirror/state'
import * as cmds from '@codemirror/commands'

let modeEq = ({state}, m) => /* TODO: StateField */ Math.random() < 0.5
let vimify = cmd => view => modeEq(view, 'N') && !void cmds[`cursor${cmd}`](view)

let view = self.view = new EditorView({
  state: EditorState.create({
    doc: 'Hello,\n  Vim!',
    extensions: keymap.of([
      { key: 'h', run: vimify('CharLeft') },
      { key: 'j', run: vimify('LineDown') },
      { key: 'k', run: vimify('LineUp') },
      { key: 'l', run: vimify('CharRight') },
    ]),
  }),
  parent: document.body,
})
