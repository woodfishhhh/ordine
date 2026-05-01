# AGENTS.md

> Ordine — an AI-first pipeline orchestration platform for code quality automation

## Core Principles

### 1. AI-First Development

All implementation decisions must prioritize **AI accessibility and integration**:

- Every feature should be designed so that an AI agent can discover, invoke, and compose it with minimal friction
- Prefer declarative configuration over imperative code — pipelines, operations, and skills are data-driven
- Keep interfaces narrow and typed so agents can reason about inputs/outputs without ambiguity
- When choosing between two equally valid approaches, pick the one that is easier for an agent to automate

### 2. Ontological Purity

Code must be **ontologically sound** — every entity, relationship, and transformation should reflect its true nature:

- A DAO is a DAO; it talks to the database and nothing else
- A Service orchestrates business logic; it never touches SQL directly
- A Pipeline is a directed graph of typed nodes; it never contains inline business logic
- Types are derived from schemas (`z.infer`), never hand-duplicated
- Naming must reflect essence: if it's a check, call it `check`; if it fixes, call it `fix`

### 3. Backend-First Protocol

Any feature involving frontend + backend must follow strict ordering:

1. **Backend** — implement API / tRPC route / DAO / Service
2. **Backend test** — verify the interface returns correct data
3. **Frontend** — build UI against the verified interface
4. **Frontend test** — confirm end-to-end behavior

Skipping or reordering is a protocol violation

### 4. Zero-Tolerance Error Handling

- **Absolutely no `try-catch`, `try-finally`, or `.catch()` anywhere** in the codebase
- Use `neverthrow` exclusively: `Result<T, E>`, `ResultAsync<T, E>`, `Result.fromThrowable()`, `ResultAsync.fromPromise()`
- Errors are values, not exceptions; callers must handle them explicitly

### 5. Single Responsibility Per File

- One React component per `.tsx` file
- One DAO per table
- One Service per domain
- Barrel exports (`index.ts`) only re-export; no business logic

### 6. Functional Purity

- Prefer pure functions and immutable data
- State changes through Zustand stores with slice pattern, never through mutable globals
- Side effects isolated at the boundary; core logic remains referentially transparent
- No implicit dependencies — everything is explicit, injectable, and testable

## Frontend-Specific Rules

### F1. No useEffect

- **Do not use `useEffect`**. It is a source of bugs: dependency changes trigger callbacks but "nobody understands why they are called"
- Find alternatives: derive state from props, use event handlers, or lift state to the store
- If you absolutely need side effects, isolate them in a dedicated hook file with a clear name, never inline in a component

### F2. Component Names Must End in a Noun

- Component names must end in a noun that corresponds to a visible entity: `Button`, `Dialog`, `Card`, `Form`
- **Forbidden**: verb endings like `CanvasQuickAdd` (Add is a verb), `CreateOperation` (Create is a verb)
- **Correct**: `CanvasQuickAddPanel`, `OperationCreator`, `OperationForm`

### F3. Export Name Must Match File Name

- The exported component name, the file name, and the external import name must all match exactly
- **Forbidden**: file `Button.tsx` exports `PrimaryButton`; file `utils.ts` exports `formatDate`
- **Correct**: file `Button.tsx` exports `Button`; file `formatDate.ts` exports `formatDate`
- Barrel exports (`index.ts`) are allowed only for re-exporting; the re-exported name must still match the original

### F4. No Conditional Rendering Inside Child Components

- Child components must not contain `if (!isOpen) return null` or similar guards
- **The parent component is responsible for conditional rendering**
- **Forbidden**:
  ```tsx
  const Dialog = ({ isOpen }) => {
    if (!isOpen) return null;  // WRONG
    return <div>...</div>;
  };
  ```
- **Correct**:
  ```tsx
  const Parent = () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div>
        {isOpen && <Dialog />}  {/* Parent decides */}
      </div>
    );
  };
  ```

### F5. Logic and View Must Be Separated

- Components must not define `handleXxx` functions and pass them down
- **All event handlers must come directly from the Store**
- **Forbidden**:
  ```tsx
  const Form = () => {
    const handleSubmit = () => { ... };  // WRONG: inline handler
    return <button onClick={handleSubmit}>Submit</button>;
  };
  ```
- **Correct**:
  ```tsx
  const Form = () => {
    const store = useFormStore();
    const handleSubmit = useStore(store, s => s.handleSubmit);  // From store
    return <button onClick={handleSubmit}>Submit</button>;
  };
  ```
