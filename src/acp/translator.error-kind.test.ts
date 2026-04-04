import type { PromptRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import type { EventFrame } from "../gateway/protocol/index.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";

async function createPendingPromptHarness() {
  const sessionId = "session-1";
  const sessionKey = "agent:main:main";

  let runId: string | undefined;
  const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === "chat.send") {
      runId = params?.idempotencyKey as string | undefined;
      return new Promise<never>(() => {});
    }
    return {};
  }) as GatewayClient["request"];

  const sessionStore = createInMemorySessionStore();
  sessionStore.createSession({
    sessionId,
    sessionKey,
    cwd: "/tmp",
  });

  const agent = new AcpGatewayAgent(
    createAcpConnection(),
    createAcpGateway(request),
    { sessionStore },
  );
  const promptPromise = agent.prompt({
    sessionId,
    prompt: [{ type: "text", text: "hello" }],
    _meta: {},
  } as unknown as PromptRequest);

  await vi.waitFor(() => {
    expect(runId).toBeDefined();
  });

  return {
    agent,
    promptPromise,
    runId: runId!,
  };
}

function createChatEvent(payload: Record<string, unknown>): EventFrame {
  return {
    type: "event",
    event: "chat",
    payload,
  } as EventFrame;
}

describe("acp translator errorKind handling", () => {
  it("resolves as end_turn when errorKind is refusal", async () => {
    const { agent, promptPromise, runId } = await createPendingPromptHarness();

    await agent.handleGatewayEvent(
      createChatEvent({
        runId,
        sessionKey: "agent:main:main",
        seq: 1,
        state: "error",
        errorKind: "refusal",
        error: "I cannot do that.",
      }),
    );

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
  });

  it("rejects when errorKind is a transient error (timeout)", async () => {
    const { agent, promptPromise, runId } = await createPendingPromptHarness();

    await agent.handleGatewayEvent(
      createChatEvent({
        runId,
        sessionKey: "agent:main:main",
        seq: 1,
        state: "error",
        errorKind: "timeout",
        error: "gateway timeout",
      }),
    );

    await expect(promptPromise).rejects.toThrow("gateway timeout (timeout)");
  });

  it("rejects when errorKind is a transient error (rate_limit)", async () => {
    const { agent, promptPromise, runId } = await createPendingPromptHarness();

    await agent.handleGatewayEvent(
      createChatEvent({
        runId,
        sessionKey: "agent:main:main",
        seq: 1,
        state: "error",
        errorKind: "rate_limit",
        error: "too many requests",
      }),
    );

    await expect(promptPromise).rejects.toThrow("too many requests (rate_limit)");
  });

  it("rejects when no errorKind is provided (backward compatibility as error)", async () => {
    const { agent, promptPromise, runId } = await createPendingPromptHarness();

    await agent.handleGatewayEvent(
      createChatEvent({
        runId,
        sessionKey: "agent:main:main",
        seq: 1,
        state: "error",
        error: "something went wrong",
      }),
    );

    await expect(promptPromise).rejects.toThrow("something went wrong");
  });
});
