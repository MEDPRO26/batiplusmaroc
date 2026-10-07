import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type SupportCtx = QueryCtx | MutationCtx;
export type SupportContext = {
  conversation: Doc<"clientSupportConversations">;
  project: Doc<"projects">;
  client: Doc<"users">;
};

/** Never transfer private history implicitly when a Project's owner changes. */
export async function supportContextFor(
  ctx: SupportCtx,
  conversation: Doc<"clientSupportConversations">,
): Promise<SupportContext | null> {
  const [project, client] = await Promise.all([
    ctx.db.get(conversation.projectId),
    ctx.db.get(conversation.clientId),
  ]);
  if (
    !project || project.clientId !== conversation.clientId
    || !client || client.accountType !== "client" || client.onboardingStatus !== "completed"
  ) return null;
  return { conversation, project, client };
}
