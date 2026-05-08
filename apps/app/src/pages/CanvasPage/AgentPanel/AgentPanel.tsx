import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import {
  Bot,
  X,
  Send,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { ScrollArea } from "@repo/ui/scroll-area";
import { Input } from "@repo/ui/input";
import { cn } from "@repo/ui/lib/utils";
import { ResultAsync } from "neverthrow";
import { useHarnessCanvasStore } from "../_store";
import { dataProvider, ResourceName } from "@/integrations/refine/dataProvider";
import { toastStore } from "@/store/toastStore";
import type {
  PipelineOperationProposal,
  PipelineOperation,
  PipelineOperationDiagnostic,
} from "@repo/pipeline-engine/schemas";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const getOperationLabel = (op: PipelineOperation): string => {
  switch (op.type) {
    case "addNode":
      return `添加节点: ${op.node.type}`;
    case "removeNode":
      return `删除节点: ${op.nodeId}`;
    case "addEdge":
      return `添加连线: ${op.edge.source} → ${op.edge.target}`;
    case "removeEdge":
      return `删除连线: ${op.edgeId}`;
    case "reconnectEdge":
      return `重连连线: ${op.edgeId}`;
    case "replaceNodeData":
      return `替换节点数据: ${op.nodeId}`;
    default:
      return (op as { type: string }).type;
  }
};

export const AgentPanel = () => {
  const { t } = useTranslation();
  const store = useHarnessCanvasStore();

  const agentPanel = useStore(store, (state) => state.agentPanel);
  const toggleAgentPanel = useStore(store, (state) => state.toggleAgentPanel);
  const setPendingProposal = useStore(store, (state) => state.setPendingProposal);
  const clearPendingProposal = useStore(store, (state) => state.clearPendingProposal);
  const applyAgentProposal = useStore(store, (state) => state.applyAgentProposal);
  const pipelineId = useStore(store, (state) => state.pipelineId);
  const pipelineName = useStore(store, (state) => state.pipelineName);
  const nodes = useStore(store, (state) => state.nodes);
  const edges = useStore(store, (state) => state.edges);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: t("canvas.agentPanel.welcome"),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [needsRuntimeSetup, setNeedsRuntimeSetup] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const doSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    if (!pipelineId) {
      toastStore.getState().addToast({
        type: "error",
        title: t("canvas.runFailed"),
        description: t("canvas.noPipelineId"),
      });
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    scrollToBottom();
    setIsSending(true);

    const runtimeSetupResult = await ResultAsync.fromPromise(
      Promise.all([
        dataProvider.getOne!({
          resource: ResourceName.settings,
          id: "default",
        }),
        dataProvider.getList!({
          resource: ResourceName.agentRuntimes,
        }),
      ]),
      (error) => (error instanceof Error ? error : new Error(String(error)))
    );

    if (runtimeSetupResult.isErr()) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: t("canvas.agentPanel.error"),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      toastStore.getState().addToast({
        type: "error",
        title: t("canvas.agentPanel.errorTitle"),
        description: runtimeSetupResult.error.message,
      });
      setIsSending(false);
      scrollToBottom();
      return;
    }

    const [settingsResult, runtimesResult] = runtimeSetupResult.value;
    const settings = settingsResult.data as { defaultAgentRuntime?: string };
    const runtimeConfigs = runtimesResult.data as Array<{ type?: string }>;
    const hasConfiguredRuntime = runtimeConfigs.some(
      (runtime) => runtime.type === settings.defaultAgentRuntime
    );

    if (!hasConfiguredRuntime) {
      setNeedsRuntimeSetup(true);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: t("canvas.agentPanel.runtimeNotConfigured"),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsSending(false);
      scrollToBottom();
      return;
    }

    setNeedsRuntimeSetup(false);

    const result = await ResultAsync.fromPromise(
      dataProvider.custom!({
        url: "pipelines/proposeOperations",
        method: "post",
        payload: {
          id: pipelineId,
          snapshot: { nodes, edges },
          message: text,
          pipelineName,
        },
      }),
      (error) => (error instanceof Error ? error : new Error(String(error)))
    );

    if (result.isErr()) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: t("canvas.agentPanel.error"),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      toastStore.getState().addToast({
        type: "error",
        title: t("canvas.agentPanel.errorTitle"),
        description: result.error.message,
      });
      setIsSending(false);
      scrollToBottom();
      return;
    }

    const data = result.value.data as {
      proposal?: PipelineOperationProposal | null;
      diagnostics?: PipelineOperationDiagnostic[] | null;
      reply?: string;
    };

    const proposal = data.proposal ?? null;
    const diagnostics = data.diagnostics ?? null;
    const reply =
      data.reply ??
      (proposal
        ? t("canvas.agentPanel.proposalReceived")
        : t("canvas.agentPanel.noProposal"));

    setPendingProposal(proposal, diagnostics);

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: reply,
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setIsSending(false);
    scrollToBottom();
  }, [
    inputValue,
    pipelineId,
    t,
    setPendingProposal,
    scrollToBottom,
    nodes,
    edges,
    pipelineName,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void doSend();
      }
    },
    [doSend]
  );

  const hasBlockingDiagnostics =
    agentPanel.diagnostics?.some((diagnostic) => diagnostic.severity === "error") ?? false;

  const handleApply = useCallback(() => {
    if (!agentPanel.pendingProposal || hasBlockingDiagnostics) return;

    const applied = applyAgentProposal(agentPanel.pendingProposal);
    if (!applied) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `system-${Date.now()}`,
        role: "assistant",
        content: t("canvas.agentPanel.applied"),
      },
    ]);
  }, [agentPanel.pendingProposal, applyAgentProposal, hasBlockingDiagnostics, t]);

  const handleDiscard = useCallback(() => {
    clearPendingProposal();
    setMessages((prev) => [
      ...prev,
      {
        id: `system-${Date.now()}`,
        role: "assistant",
        content: t("canvas.agentPanel.discarded"),
      },
    ]);
  }, [clearPendingProposal, t]);

  const proposal = agentPanel.pendingProposal as PipelineOperationProposal | null;
  const hasProposal = proposal !== null;

  return (
    <div className="absolute bottom-0 right-0 top-0 z-30 flex w-80 flex-col border-l bg-background shadow-lg">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4 text-primary" />
          <span>{t("canvas.agentPanel.title")}</span>
        </div>
        <Button
          className="h-7 w-7"
          size="icon"
          variant="ghost"
          onClick={toggleAgentPanel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-3 p-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted"
              )}
            >
              {msg.content}
            </div>
          ))}

          {(isSending || agentPanel.isLoading) && (
            <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("canvas.agentPanel.thinking")}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Diagnostics */}
      {agentPanel.diagnostics && agentPanel.diagnostics.length > 0 && (
        <div className="border-t">
          <div className="flex flex-col gap-2 p-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t("canvas.agentPanel.diagnostics")}
            </span>
            {agentPanel.diagnostics.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
                  d.severity === "error"
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-amber-200 bg-amber-50 text-amber-700"
                )}
              >
                {d.severity === "error" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span>{d.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proposal */}
      {hasProposal && (
        <div className="border-t">
          <div className="flex flex-col gap-2 p-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t("canvas.agentPanel.proposal")}
            </span>
            <div className="rounded-md border bg-muted/50 p-2.5">
              <p className="mb-2 text-xs font-medium">
                {proposal.summary}
              </p>
              <ul className="flex flex-col gap-1">
                {proposal.operations.map((op, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                    {getOperationLabel(op)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="h-8 flex-1 gap-1 text-xs"
                disabled={hasBlockingDiagnostics}
                size="sm"
                variant="default"
                onClick={handleApply}
              >
                <Check className="h-3.5 w-3.5" />
                {t("canvas.agentPanel.apply")}
              </Button>
              <Button
                className="h-8 flex-1 gap-1 text-xs"
                size="sm"
                variant="outline"
                onClick={handleDiscard}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("canvas.agentPanel.discard")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {needsRuntimeSetup && (
        <div className="border-t bg-amber-50/70">
          <div className="flex items-center gap-2 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{t("canvas.agentPanel.runtimeNotConfigured")}</span>
            <a
              className="font-medium underline underline-offset-2"
              href="/runtimes"
            >
              {t("canvas.agentPanel.goToRuntimeSettings")}
            </a>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t p-3">
        <Input
          className="h-9 flex-1 text-sm"
          placeholder={t("canvas.agentPanel.inputPlaceholder")}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending || agentPanel.isLoading}
        />
        <Button
          className="h-9 w-9"
          size="icon"
          variant="ghost"
          disabled={isSending || agentPanel.isLoading || !inputValue.trim()}
          onClick={() => void doSend()}
        >
          {isSending || agentPanel.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
