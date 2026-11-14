/** A pilot batch may only be sent when every allowlisted worker has a valid preview. */
export function invalidWhatsAppPreview(query: {
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  data?: { messages: readonly { error: string | null; configurationError: string | null }[] };
}): boolean {
  return query.isLoading || query.isFetching || !!query.error ||
    !query.data?.messages.length || query.data.messages.some((entry) => !!entry.error || !!entry.configurationError);
}
