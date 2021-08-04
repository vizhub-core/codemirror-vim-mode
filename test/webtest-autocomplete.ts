import {EditorView} from "@codemirror/view"
import {EditorState, EditorSelection, Transaction} from "@codemirror/state"
import {CompletionSource, autocompletion, CompletionContext, startCompletion,
        currentCompletions, completionStatus, completeFromList} from "@codemirror/autocomplete"
import ist from "ist"

const Timeout = 1000, Chunk = 15

type Sync = <T>(get: (state: EditorState) => T, value: T) => Promise<void>

type TestSpec = {
  doc?: string,
  selection?: number,
  sources: readonly CompletionSource[]
}

class Runner {
  tests: {name: string, spec: TestSpec, f: (view: EditorView, sync: Sync) => Promise<void>}[] = []

  test(name: string, spec: TestSpec, f: (view: EditorView, sync: Sync) => Promise<void>) {
    this.tests.push({name, spec, f})
  }

  options(name: string, doc: string, sources: readonly CompletionSource[], list: string) {
    this.test(name, {doc, sources}, (view, sync) => {
      startCompletion(view)
      return sync(options, list)
    })
  }

  runTest(name: string, spec: TestSpec, f: (view: EditorView, sync: Sync) => Promise<void>) {
    let syncing: {get: (state: EditorState) => any, value: any, resolve: () => void} | null = null
    let view = new EditorView({
      state: EditorState.create({
        doc: spec.doc,
        selection: EditorSelection.single(spec.selection ?? (spec.doc ? spec.doc.length : 0)),
        extensions: autocompletion({override: spec.sources})
      }),
      parent: document.querySelector("#workspace")! as HTMLElement,
      dispatch: tr => {
        if (syncing && syncing.get(tr.state) === syncing.value) {
          syncing.resolve()
          syncing = null
        }
        view.update([tr])
      }
    })
    let sync = (get: (state: EditorState) => any, value: any) => new Promise<void>((resolve, reject) => {
      if (syncing) throw new Error("Overlapping syncs")
      if (get(view.state) === value) return resolve()
      let mine = syncing = {get, value, resolve}
      setTimeout(() => {
        if (syncing == mine) reject(new Error(`${name}: Failed to sync: ${get(view.state)} !== ${value}\n`))
      }, Timeout)
    })
    return {view, promise: f(view, sync)}
  }

  async finish(filter?: string) {
    let tests = this.tests
    if (filter) tests = tests.filter(t => t.name.indexOf(filter) > -1)
    for (let from = 0; from < tests.length; from += Chunk) {
      let active = tests.slice(from, Math.min(tests.length, from + Chunk)).map(t => this.runTest(t.name, t.spec, t.f))
      let cleanup = () => {
        for (let {view} of active) view.destroy()
      }
      await Promise.all(active.map(t => t.promise)).then(cleanup, err => { cleanup(); throw err })
    }
  }
}

function from(list: string): CompletionSource {
  return cx => {
    let word = cx.matchBefore(/\w+$/)
    if (!word && !cx.explicit) return null
    return {from: word ? word.from : cx.pos, options: list.split(" ").map(w => ({label: w})), span: /\w*/}
  }
}

function tagged(span: boolean): CompletionSource {
  return cx => {
    let word = cx.matchBefore(/\w+$/)
    return {from: word ? word.from : cx.pos, options: [{label: "tag" + cx.pos}], span: span ? /\w*/ : undefined}
  }
}

function sleep(delay: number) {
  return new Promise(resolve => setTimeout(() => resolve(undefined), delay))
}

function slow(c: CompletionSource, delay: number): CompletionSource {
  return (cx: CompletionContext) => new Promise(resolve => setTimeout(() => resolve(c(cx)), delay))
}

function once(c: CompletionSource): CompletionSource {
  let done = false
  return (cx: CompletionContext) => {
    if (done) throw new Error("Used 'once' completer multiple times")
    done = true
    return c(cx)
  }
}

function options(s: EditorState) { return currentCompletions(s).map(c => c.label).join(" ") }

function type(view: EditorView, text: string) {
  let cur = view.state.selection.main.head
  view.dispatch({changes: {from: cur, insert: text},
                 selection: {anchor: cur + text.length},
                 annotations: Transaction.userEvent.of("input")})
}

function del(view: EditorView) {
  let cur = view.state.selection.main.head
  view.dispatch({changes: {from: cur - 1, to: cur},
                 annotations: Transaction.userEvent.of("delete")})
}

const words = "one onetwothree OneTwoThree two three"

describe("autocomplete", () => {
  // Putting all tests together in a single `it` to allow them to run
  // concurrently.
  it("works", function() {
    this.timeout(5000)

    let run = new Runner

    run.options("prefers by-word matches", "ott", [from(words)], "OneTwoThree onetwothree")

    run.options("can merge multiple sources", "one", [from(words), from("onet bonae")], "one onet onetwothree OneTwoThree bonae")

    run.options("only shows prefix matches for single-letter queries", "t", [from(words)], "three two")

    run.options("doesn't allow split matches for two-letter queries", "wr", [from(words)], "")

    run.options("prefers case-matched completions", "eTw", [from(words)], "OneTwoThree onetwothree")

    run.options("allows everything for empty patterns", "", [from("a b foo")], "a b foo")

    run.options("sorts alphabetically when score is equal", "a", [from("ac ab acc")], "ab ac acc")

    run.options("removes duplicate options", "t", [from("two"), from("two three")], "three two")

    run.options("handles all-uppercase words", "sel", [from("SCOPE_CATALOG SELECT SELECTIVE")], "SELECT SELECTIVE SCOPE_CATALOG")

    run.test("will eagerly populate the result list when a source is slow", {
      doc: "on",
      sources: [from("one two"), slow(from("ono"), 100)]
    }, async (view, sync) => {
      startCompletion(view)
      await sync(options, "one")
      await sync(options, "one ono")
    })

    run.test("starts completion on input", {sources: [from("one two")]}, async (view, sync) => {
      type(view, "o")
      await sync(options, "one")
    })

    run.test("further narrows completions on input", {sources: [once(from("one okay ono"))]}, async (view, sync) => {
      type(view, "o")
      await sync(options, "okay one ono")
      type(view, "n")
      await sync(options, "one ono")
      type(view, "e")
      await sync(options, "one")
      type(view, "k")
      await sync(options, "")
    })

    run.test("doesn't abort on backspace", {sources: [once(from("one okay")), once(from("ohai"))]}, async (view, sync) => {
      type(view, "on")
      await sync(options, "one")
      del(view)
      await sync(options, "ohai okay one")
      del(view)
      await sync(options, "")
    })

    run.test("can backspace out entire word when explicit", {sources: [from("one two")]}, async (view, sync) => {
      startCompletion(view)
      await sync(options, "one two")
      type(view, "o")
      await sync(options, "one")
      del(view)
      await sync(options, "one two")
    })

    run.test("stops explicit completion on non-spanning input", {sources: [from("one two")]}, async (view, sync) => {
      startCompletion(view)
      await sync(options, "one two")
      type(view, "o")
      await sync(options, "one")
      type(view, " ")
      await sync(options, "")
      del(view)
      await sync(options, "")
    })

    run.test("stops explicit completions for non-matching input", {sources: [from("one")]}, async (view, sync) => {
      startCompletion(view)
      await sync(options, "one")
      type(view, "x")
      await sync(options, "")
      del(view)
      await sync(options, "")
    })

    run.test("resets selection after refinement", {
      sources: [once(from("primitive-classnames print proxy"))]
    }, async (view, sync) => {
      type(view, "p")
      await sync(options, "primitive-classnames print proxy")
      type(view, "rin")
      await sync(options, "print primitive-classnames")
      ist(view.dom.querySelector("[aria-selected]")?.textContent, "print")
    })

    run.test("calls sources again when necessary", {sources: [tagged(true)]}, async (view, sync) => {
      type(view, "t")
      await sync(options, "tag1")
      type(view, " t")
      await sync(options, "tag3")
    })

    run.test("always calls span-less sources", {sources: [tagged(false)]}, async (view, sync) => {
      startCompletion(view)
      await sync(options, "tag0")
      type(view, "ta")
      await sync(options, "tag2")
      del(view)
      await sync(options, "tag1")
      del(view)
      await sync(options, "tag0")
    })

    run.test("adjust completions when changes happen during query", {
      sources: [slow(once(from("one ok")), 100)]
    }, async (view, sync) => {
      type(view, "o")
      await sleep(80)
      type(view, "n")
      await sync(options, "one")
    })

    run.test("doesn't cancel completions when deleting before they finish", {
      sources: [slow(tagged(false), 80)]
    }, async (view, sync) => {
      type(view, "ta")
      await sleep(80)
      del(view)
      await sync(options, "tag1")
    })

    run.test("preserves the dialog on irrelevant changes", {
      sources: [from("one two")],
      doc: "woo o"
    }, async (view, sync) => {
      startCompletion(view)
      await sync(options, "one")
      let dialog = view.dom.querySelector(".cm-tooltip")
      ist(dialog)
      view.dispatch({changes: {from: 0, insert: "!"}})
      ist(view.dom.querySelector(".cm-tooltip"), dialog)
    })

    run.test("complete from list", {sources: [once(completeFromList(["one", "two", "three"]))], doc: "t"}, async (view, sync) => {
      startCompletion(view)
      await sync(options, "three two")
      type(view, "h")
      await sync(options, "three")
      del(view)
      await sync(options, "three two")
      del(view)
      await sync(options, "one three two")
    })

    run.test("complete from nonalphabetic list", {
      sources: [completeFromList(["$foo.bar", "$baz.boop", "$foo.quux"])]
    }, async (view, sync) => {
      type(view, "x")
      await sync(v => completionStatus(v), null)
      type(view, "$")
      await sync(options, "$baz.boop $foo.bar $foo.quux")
      type(view, "foo.b")
      await sync(options, "$foo.bar")
    })

    let events: string[] = []
    run.test("calls abort handlers", {
      sources: [async cx => {
        events.push("start " + cx.aborted)
        cx.addEventListener("abort", () => events.push("aborted"))
        await sleep(50)
        events.push("fin " + cx.aborted)
        return from("one two")(cx)
      }],
      doc: "one two\nthree four "
    }, async (view) => {
      startCompletion(view)
      await sleep(80)
      view.dispatch({selection: {anchor: 1}})
      await sleep(80)
      ist(events.join(", "), "start false, aborted, fin true")
    })

    run.test("supports unfitered completions", {
      sources: [completeFromList(["one", "two"]), cx => ({from: cx.pos, options: [{label: "ok"}, {label: "hah"}], filter: false})],
      doc: "o"
    }, async (view, sync) => {
      startCompletion(view)
      await sync(options, "ok hah one")
    })

    return run.finish()
  })
})
