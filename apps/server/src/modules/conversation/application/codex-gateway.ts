export interface PromptPacket {
  systemRules: string[];
  projectCharter: string;
  currentQuestion: string;
  threadSummary: string;
  retrievedEvidence: Array<{
    filePath: string;
    heading: string;
    excerpt: string;
  }>;
  allowedTools: string[];
  outputContract: {
    mustCite: boolean;
    allowHypothesis: boolean;
  };
}

export interface CodexStreamEvent {
  type: "token" | "message" | "done";
  text?: string;
}

export interface CodexGateway {
  streamTurn(input: {
    projectId: string;
    threadId: string;
    packet: PromptPacket;
    signal?: AbortSignal;
  }): AsyncGenerator<CodexStreamEvent, void, void>;
}
