import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { mergeMomoMessages } from "../src/lib/momo/messageView.ts";

// Exercise the real page's submit handler with a deferred API and persistence.
// All network/auth/storage dependencies are isolated; no user data is written.
const compiled = ts.transpileModule(readFileSync(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const response = deferred();
  const persistence = deferred();
  const states = [[{ id: "conversation", title: "Test" }], "conversation"];
  states[14] = false; // History has loaded before the user submits a message.
  const refs = [];
  let stateCursor = 0;
  let refCursor = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] ??= { current: initial }; },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: () => {},
  };
  const context = createContext({
    exports, process: { env: {} }, console: { error() {} },
    fetch: () => response.promise,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
      if (name.endsWith("AuthContext")) return { useAuth: () => ({ user: { uid: "test-user", getIdToken: async () => "test-token" }, loading: false }) };
      if (name.endsWith("messageView")) return { mergeMomoMessages };
      if (name.endsWith("ids/uuid")) return { createUuid: () => "request" };
      if (name.endsWith("momoConversationService")) return { getMomoConversationKey: async () => ({}), persistEncryptedMomoTurn: () => persistence.promise };
      // UI components are opaque elements in the tree; effects do not subscribe.
      return new Proxy({}, { get: (_target, prop) => prop });
    },
  });
  runInContext(compiled, context);
  function render() { stateCursor = 0; refCursor = 0; return exports.default(); }
  function elements(node, predicate, found = []) {
    if (Array.isArray(node)) node.forEach((item) => elements(item, predicate, found));
    else if (node && typeof node === "object" && node.props) {
      if (predicate(node)) found.push(node);
      elements(node.props.children, predicate, found);
    }
    return found;
  }
  const find = (predicate) => elements(render(), predicate)[0];
  const type = (text) => find((node) => node.props["aria-label"] === "Message Momo").props.onChange({ target: { value: text } });
  const submit = () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  const bubbles = () => elements(render(), (node) => node.type === "article").map((node) => node.props.children.props.children);
  return { response, persistence, type, submit, bubbles, find };
}

test("Momo renders the submitted text immediately, before the API or encrypted save resolves", async () => {
  const page = harness();
  page.type("Hello Momo");
  const sending = page.submit();
  assert.deepEqual(page.bubbles(), ["Hello Momo"]);
  assert.ok(page.find((node) => node.props.role === "status"));
  await tick();
  page.response.resolve({ ok: true, json: async () => ({ message: "Hello there", continuityState: {} }) });
  await tick();
  assert.deepEqual(page.bubbles(), ["Hello Momo"]);
  page.persistence.resolve();
  await sending;
  assert.deepEqual(page.bubbles(), ["Hello Momo", "Hello there"]);
  assert.equal(page.find((node) => node.props.role === "status"), undefined);
});

test("a failed send restores the text without erasing the user's next draft", async () => {
  const page = harness();
  page.type("First message");
  const sending = page.submit();
  page.type("Next draft");
  await tick();
  page.response.resolve({ ok: false, status: 503, json: async () => ({ error: "Please try again" }) });
  await sending;
  assert.deepEqual(page.bubbles(), []);
  assert.equal(page.find((node) => node.props["aria-label"] === "Message Momo").props.value, "First message\n\nNext draft");
  assert.equal(page.find((node) => node.props.role === "alert").props.children, "Please try again");
});
