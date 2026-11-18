export function AgentChip({ model }: { model: string | null | undefined }) {
  if (!model) return null;
  return (
    <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-canvas px-2 py-0.5 align-middle text-[10px] font-semibold text-ink-mute">
      AI · {model}
    </span>
  );
}
