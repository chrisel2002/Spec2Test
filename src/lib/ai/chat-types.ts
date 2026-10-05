import type { UIMessage } from "ai";

import type { RetrievedChunk } from "./retrieval";

export type ChatDataParts = {
  citations: RetrievedChunk[];
};

export type SpecUIMessage = UIMessage<never, ChatDataParts>;
