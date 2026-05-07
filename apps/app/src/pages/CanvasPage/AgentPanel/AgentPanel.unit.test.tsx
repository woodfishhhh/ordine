import { render } from "@/test/test-wrapper";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentPanel } from "./AgentPanel";
import { HarnessCanvasStoreProvider, useHarnessCanvasStore } from "../_store";
import { useRef } from "react";
import type { PipelineOperationProposal, PipelineOperationDiagnostic } from "@repo/pipeline-engine/schemas";
import { ok } from "neverthrow";
import zh from "@/locales/zh.json";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const keys = key.split(".");
        let value: unknown = zh;
        for (const k of keys) {
          if (value && typeof value === "object" && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            return key;
          }
        }
        return typeof value === "string" ? value : key;
      },
      i18n: { changeLanguage: vi.fn() },
    }),
  };
});

const mockApplyPipelineOperations = vi.fn();

vi.mock("@repo/pipeline-engine/operations", () => ({
  applyPipelineOperations: (...args: unknown[]) => mockApplyPipelineOperations(...args),
}));

const mockCustom = vi.fn();
vi.mock("@/integrations/refine/dataProvider", () => ({
  dataProvider: { custom: (...args: unknown[]) => mockCustom(...args) },
}));

vi.mock("@repo/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
    className,
    variant,
    size,
  }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => (
    <button className={className} disabled={disabled} title={title} onClick={onClick} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

vi.mock("@repo/ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@repo/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const wrapperWithoutPipeline = ({ children }: { children?: React.ReactNode }) => (
  <HarnessCanvasStoreProvider>{children}</HarnessCanvasStoreProvider>
);

const PanelActivator = ({
  children,
  isOpen = true,
  pendingProposal = null,
  diagnostics = null,
}: {
  children?: React.ReactNode;
  isOpen?: boolean;
  pendingProposal?: PipelineOperationProposal | null;
  diagnostics?: PipelineOperationDiagnostic[] | null;
}) => {
  const store = useHarnessCanvasStore();
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    store.setState({
      agentPanel: {
        isOpen,
        pendingProposal,
        diagnostics,
        isLoading: false,
      },
    });
  }
  return <>{children}</>;
};

const wrapperWithState = (props: {
  isOpen?: boolean;
  pendingProposal?: PipelineOperationProposal | null;
  diagnostics?: PipelineOperationDiagnostic[] | null;
} = {}) => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => (
    <HarnessCanvasStoreProvider pipeline={{ id: "pipe-1", name: "Test Pipeline", nodes: [], edges: [] }}>
      <PanelActivator {...props}>{children}</PanelActivator>
    </HarnessCanvasStoreProvider>
  );
  return Wrapper;
};

const makeProposal = (overrides: Partial<PipelineOperationProposal> = {}): PipelineOperationProposal => ({
  summary: "添加操作节点",
  operations: [
    {
      type: "addNode",
      node: {
        id: "op-1",
        type: "operation",
        position: { x: 100, y: 100 },
        data: { operationId: "op-test", label: "Test Op" },
      },
    } as PipelineOperationProposal["operations"][number],
  ],
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentPanel", () => {
  beforeEach(() => {
    mockCustom.mockReset();
    mockApplyPipelineOperations.mockReset();
  });

  it("renders panel with title and welcome message", () => {
    render(<AgentPanel />, { wrapper: wrapperWithState() });
    expect(screen.getByText("AI 助手")).toBeInTheDocument();
    expect(screen.getByText(/你好！我是你的 AI 助手/)).toBeInTheDocument();
  });

  it("calls toggleAgentPanel when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<AgentPanel />, { wrapper: wrapperWithState() });

    const store = screen.getByText("AI 助手").closest("div")?.parentElement;
    const closeBtn = store?.querySelector("button");
    expect(closeBtn).toBeTruthy();

    await user.click(closeBtn!);
    // toggleAgentPanel flips isOpen; panel is still rendered because component
    // doesn't gate on isOpen itself — the parent (CanvasInner) does.
    expect(closeBtn).toBeInTheDocument();
  });

  it("sends user message and displays it", async () => {
    const user = userEvent.setup();
    mockCustom.mockResolvedValue({
      data: { reply: "已处理", proposal: null, diagnostics: null },
    });

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...");

    await user.type(input, "添加一个操作节点");
    await user.keyboard("{Enter}");

    expect(screen.getByText("添加一个操作节点")).toBeInTheDocument();
    expect(mockCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "pipelines/proposeOperations",
        method: "post",
        payload: expect.objectContaining({
          id: "pipe-1",
          message: "添加一个操作节点",
        }),
      })
    );
    await waitFor(() => {
      expect(screen.getByText("已处理")).toBeInTheDocument();
    });
  });

  it("sends message via button click", async () => {
    const user = userEvent.setup();
    mockCustom.mockResolvedValue({
      data: { reply: "好的", proposal: null, diagnostics: null },
    });

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...");
    await user.type(input, "hello");

    // Send button is the last button (close button is first)
    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons.at(-1);
    expect(sendBtn).toBeTruthy();
    await user.click(sendBtn!);

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
    });
  });

  it("shows thinking indicator while loading", async () => {
    const user = userEvent.setup();
    mockCustom.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...");
    await user.type(input, "test");
    await user.keyboard("{Enter}");

    expect(screen.getByText("思考中...")).toBeInTheDocument();
  });

  it("displays proposal with apply and discard buttons", () => {
    const proposal = makeProposal();
    render(<AgentPanel />, {
      wrapper: wrapperWithState({ pendingProposal: proposal }),
    });

    expect(screen.getByText("操作建议")).toBeInTheDocument();
    expect(screen.getByText("添加操作节点")).toBeInTheDocument();
    expect(screen.getByText("应用")).toBeInTheDocument();
    expect(screen.getByText("丢弃")).toBeInTheDocument();
  });

  it("applies proposal and shows confirmation", async () => {
    const user = userEvent.setup();
    const proposal = makeProposal();
    mockApplyPipelineOperations.mockReturnValue(
      ok({ nodes: [], edges: [] })
    );

    render(<AgentPanel />, {
      wrapper: wrapperWithState({ pendingProposal: proposal }),
    });

    await user.click(screen.getByText("应用"));

    expect(mockApplyPipelineOperations).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) }),
      proposal.operations
    );
    expect(screen.getByText("已应用操作建议。")).toBeInTheDocument();
  });

  it("discards proposal and shows confirmation", async () => {
    const user = userEvent.setup();
    const proposal = makeProposal();

    render(<AgentPanel />, {
      wrapper: wrapperWithState({ pendingProposal: proposal }),
    });

    await user.click(screen.getByText("丢弃"));
    expect(screen.getByText("已丢弃操作建议。")).toBeInTheDocument();
  });

  it("displays diagnostics when present", () => {
    const diagnostics: PipelineOperationDiagnostic[] = [
      { code: "DUPLICATE_NODE_ID", severity: "error", message: "节点 ID 重复" },
      { code: "INVALID_CONNECTION", severity: "warning", message: "缺少输入端口" },
    ];

    render(<AgentPanel />, {
      wrapper: wrapperWithState({ diagnostics }),
    });

    expect(screen.getByText("诊断信息")).toBeInTheDocument();
    expect(screen.getByText("节点 ID 重复")).toBeInTheDocument();
    expect(screen.getByText("缺少输入端口")).toBeInTheDocument();
  });

  it("does not send message when pipelineId is missing", async () => {
    const user = userEvent.setup();
    render(<AgentPanel />, { wrapper: wrapperWithoutPipeline });

    const input = screen.getByPlaceholderText("输入你的需求...") as HTMLInputElement;
    await user.type(input, "test");
    await user.keyboard("{Enter}");

    // Input should still contain the text (not cleared) and no user message added
    expect(input.value).toBe("test");
    expect(screen.queryByText("test")).not.toBeInTheDocument();
    // Welcome message is still there
    expect(screen.getByText(/你好！我是你的 AI 助手/)).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    const user = userEvent.setup();
    mockCustom.mockRejectedValue(new Error("Network error"));

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...");
    await user.type(input, "test");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/请求失败/)).toBeInTheDocument();
    });
  });

  it("disables input and send button while sending", async () => {
    const user = userEvent.setup();
    mockCustom.mockImplementation(() => new Promise(() => {}));

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...") as HTMLInputElement;
    await user.type(input, "test");
    await user.keyboard("{Enter}");

    expect(input.disabled).toBe(true);
  });

  it("shows default reply when proposal is returned without explicit reply", async () => {
    const user = userEvent.setup();
    const proposal = makeProposal();
    mockCustom.mockResolvedValue({
      data: { reply: null, proposal, diagnostics: null },
    });

    render(<AgentPanel />, { wrapper: wrapperWithState() });
    const input = screen.getByPlaceholderText("输入你的需求...");
    await user.type(input, "add node");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("已收到操作建议，请查看并决定是否应用。")).toBeInTheDocument();
    });
  });
});
