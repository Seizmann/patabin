import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical } from '@phosphor-icons/react';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { mapError } from 'lib/errors';
import bn from 'i18n/bn';
import {
  addModel,
  addProvider,
  clearProviderKey,
  listModels,
  listProviders,
  removeFromChain,
  reorderFallback,
  setDefaultModel,
  setProviderKey,
  testProvider,
  updateModel,
  updateProvider,
  type AgentModel,
  type AgentProvider,
  type ProviderTestResult,
} from './api';

export default function AgentSettingsPage() {
  usePageTitle(bn.agentSettings);
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: providers = [], isPending, isError } = useQuery({ queryKey: ['agent-providers'], queryFn: listProviders });

  const done = (msg: string) => {
    setOk(msg);
    setError('');
    void qc.invalidateQueries({ queryKey: ['agent-providers'] });
  };
  const fail = (err: unknown) => {
    setError(mapError(err));
    setOk('');
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle tag="PataBin" title={bn.agentSettings} />
      {error && <Notice tone="error">{error}</Notice>}
      {!error && ok && <Notice tone="ok">{ok}</Notice>}
      {isPending ? (
        <Card className="flex flex-col gap-3 p-6" aria-busy>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-2/3" />
        </Card>
      ) : isError ? (
        <Card className="p-6">
          <Notice tone="error">{bn.errorLoad}</Notice>
        </Card>
      ) : (
        providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onDone={done} onFail={fail} />
        ))
      )}
      {!isPending && !isError && providers.length === 0 && (
        <Card className="p-6">
          <p className="p-caption text-ink-mute">{bn.agentEmptyProviders}</p>
        </Card>
      )}
      {!isPending && !isError && <AddProviderCard onDone={done} onFail={fail} />}
    </div>
  );
}

function AddProviderCard({ onDone, onFail }: CardActions) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setBusy(true);
    try {
      await addProvider(name.trim(), baseUrl.trim());
      setName('');
      setBaseUrl('');
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <p className="p-label">{bn.agentAddProvider}</p>
      <label className="block">
        <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentProviderName}</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentBaseUrl}</span>
        <input className="field" type="url" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </label>
      <div className="max-w-40">
        <Btn busy={busy} disabled={!name.trim() || !baseUrl.trim()} onClick={() => void submit()}>
          {bn.agentAddProvider}
        </Btn>
      </div>
    </Card>
  );
}

function ProviderCard({ provider, onDone, onFail }: { provider: AgentProvider } & CardActions) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.base_url);
  const [key, setKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor));

  const { data: models = [], isPending: modelsPending } = useQuery({
    queryKey: ['agent-models', provider.id],
    queryFn: () => listModels(provider.id),
  });

  const saveKey = async () => {
    if (key.trim().length < 8) {
      onFail(new Error(bn.agentKeyMin));
      return;
    }
    setKeyBusy(true);
    try {
      await setProviderKey(provider.id, key.trim());
      setKey('');
      onDone(bn.agentKeySaved);
    } catch (err) {
      onFail(err);
    }
    setKeyBusy(false);
  };

  const doClearKey = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setKeyBusy(true);
    setConfirmClear(false);
    try {
      await clearProviderKey(provider.id);
      onDone(bn.agentKeyCleared);
    } catch (err) {
      onFail(err);
    }
    setKeyBusy(false);
  };

  const saveEdits = async () => {
    setBusy(true);
    try {
      await updateProvider(provider.id, { name: name.trim(), base_url: baseUrl.trim().replace(/\/+$/, '') });
      setEditing(false);
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      await updateProvider(provider.id, { is_active: !provider.is_active });
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testProvider(provider.id);
    setTestResult(result);
    setTesting(false);
  };

  const chain = models.filter((m) => m.fallback_position !== null && m.is_active);
  const outOfChain = models.filter((m) => m.fallback_position === null || !m.is_active);

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentProviderName}</span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentBaseUrl}</span>
                <input className="field" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <Btn busy={busy} onClick={() => void saveEdits()}>{bn.agentEditDone}</Btn>
                <Btn variant="ghost" onClick={() => { setEditing(false); setName(provider.name); setBaseUrl(provider.base_url); }}>{bn.cancel}</Btn>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate p-title">{provider.name}</p>
              <p className="p-caption truncate text-ink-mute">{provider.base_url}</p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <Btn variant="ghost" busy={busy} onClick={() => void toggleActive()}>
              {provider.is_active ? bn.agentSetInactive : bn.agentSetActive}
            </Btn>
            <Btn variant="ghost" onClick={() => setEditing(true)}>{bn.agentEdit}</Btn>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentKey}</span>
          {provider.key_last4 ? (
            <p className="field">•••• {provider.key_last4}</p>
          ) : (
            <p className="field text-ink-mute">{bn.agentKeyNone}</p>
          )}
        </label>
        <label className="block min-w-0 flex-1">
          <span className="p-caption mb-1 block font-semibold text-ink">{bn.agentKey}</span>
          <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn busy={keyBusy} disabled={key.trim().length < 8} onClick={() => void saveKey()}>{bn.agentSaveKey}</Btn>
        {provider.key_last4 && (
          <Btn variant="ghost" busy={keyBusy} onClick={() => void doClearKey()}>
            {confirmClear ? bn.agentKeyConfirmClear : bn.agentClearKey}
          </Btn>
        )}
        <Btn variant="ghost" busy={testing} disabled={!provider.is_active} onClick={() => void runTest()}>{bn.agentTestConnection}</Btn>
      </div>
      {testResult && (
        testResult.ok ? (
          <Notice tone="ok">
            {bn.agentTestOk} · {testResult.model} · {testResult.latency_ms}ms
          </Notice>
        ) : (
          <Notice tone="error">
            {bn.agentTestFailed}
            {testResult.error ? ` (${testResult.error})` : ''}
          </Notice>
        )
      )}

      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <p className="p-label">{bn.agentModels}</p>
        {modelsPending ? (
          <Skeleton className="h-10 w-full" />
        ) : models.length === 0 ? (
          <p className="p-caption text-ink-mute">{bn.agentEmptyModels}</p>
        ) : (
          <>
            <p className="p-caption text-ink-mute">{bn.agentFallbackHint}</p>
            {chain.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onChainDragEnd(e, chain, onDone, onFail)}>
                <SortableContext items={chain.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col">
                    {chain.map((m, i) => (
                      <ModelRow key={m.id} model={m} position={i + 1} onDone={onDone} onFail={onFail} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="p-caption text-ink-mute">{bn.agentOutOfChain}</p>
            )}
            {outOfChain.map((m) => (
              <OutOfChainRow key={m.id} model={m} providerId={provider.id} onDone={onDone} onFail={onFail} />
            ))}
          </>
        )}
        <AddModelRow providerId={provider.id} onDone={onDone} onFail={onFail} />
      </div>
    </Card>
  );
}

async function onChainDragEnd(e: DragEndEvent, chain: AgentModel[], onDone: (m: string) => void, onFail: (err: unknown) => void) {
  const { active, over } = e;
  if (!over || active.id === over.id) return;
  const oldIdx = chain.findIndex((m) => m.id === String(active.id));
  const newIdx = chain.findIndex((m) => m.id === String(over.id));
  const next = arrayMove(chain, oldIdx, newIdx).map((m) => m.id);
  try {
    await reorderFallback(next);
    onDone(bn.saved);
  } catch (err) {
    onFail(err);
  }
}

function ModelRow({ model, position, onDone, onFail }: { model: AgentModel; position: number } & CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: model.id });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 border-b border-hairline px-1 py-3 last:border-b-0 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className="grid h-11 w-8 touch-none place-items-center text-ink-mute"
        {...listeners}
        {...attributes}
        aria-label={`${bn.agentFallback}: ${model.display_name}`}
      >
        <DotsSixVertical weight="regular" size={20} />
      </button>
      <span className="p-caption w-6 text-ink-mute">{position}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {model.display_name}
          {model.is_default && <span className="p-caption ml-2 text-good">{bn.agentDefault}</span>}
          {model.supports_tools && <span className="p-caption ml-2 text-ink-mute">{bn.agentTools}</span>}
        </p>
        <p className="p-caption truncate text-ink-mute">{model.model_id}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {!model.is_default && (
          <button type="button" disabled={busy} className="p-caption text-ink underline" onClick={() => void run(() => setDefaultModel(model.id))}>
            {bn.agentSetDefault}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          className="p-caption text-bad underline"
          onClick={() => void run(() => removeFromChain(model.id))}
        >
          {bn.agentRemoveFromChain}
        </button>
      </div>
    </div>
  );
}

function OutOfChainRow({ model, providerId, onDone, onFail }: { model: AgentModel; providerId: string } & CardActions) {
  const [busy, setBusy] = useState(false);
  const addToChain = async () => {
    setBusy(true);
    try {
      const all = await listModels(providerId);
      const maxPos = Math.max(0, ...all.filter((m) => m.fallback_position !== null).map((m) => m.fallback_position as number));
      await updateModel(model.id, { fallback_position: maxPos + 1, is_active: true });
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-1 py-3 last:border-b-0">
      <span className="p-caption w-6 text-ink-mute">—</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {model.display_name}
          {!model.is_active && <span className="p-caption ml-2 text-bad">{bn.agentInactive}</span>}
          {model.supports_tools && <span className="p-caption ml-2 text-ink-mute">{bn.agentTools}</span>}
        </p>
        <p className="p-caption truncate text-ink-mute">{model.model_id}</p>
      </div>
      <button type="button" disabled={busy} className="p-caption shrink-0 text-ink underline" onClick={() => void addToChain()}>
        {model.is_active ? bn.agentAddToChain : bn.agentSetActive}
      </button>
    </div>
  );
}

function AddModelRow({ providerId, onDone, onFail }: { providerId: string } & CardActions) {
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tools, setTools] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!modelId.trim() || !displayName.trim()) return;
    setBusy(true);
    try {
      await addModel({ provider_id: providerId, model_id: modelId.trim(), display_name: displayName.trim(), supports_tools: tools });
      setModelId('');
      setDisplayName('');
      setTools(false);
      onDone(bn.saved);
    } catch (err) {
      onFail(err);
    }
    setBusy(false);
  };

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="p-caption font-semibold text-ink">{bn.agentAddModel}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-36 flex-1">
          <span className="p-caption mb-1 block text-ink-mute">{bn.agentModelId}</span>
          <input className="field" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o-mini" />
        </label>
        <label className="block min-w-36 flex-1">
          <span className="p-caption mb-1 block text-ink-mute">{bn.agentModelName}</span>
          <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5 accent-cocoa" checked={tools} onChange={(e) => setTools(e.target.checked)} />
        <span className="p-caption">{bn.agentTools}</span>
      </label>
      <div className="max-w-40">
        <Btn busy={busy} disabled={!modelId.trim() || !displayName.trim()} onClick={() => void submit()}>
          {bn.agentAddModel}
        </Btn>
      </div>
    </div>
  );
}

type CardActions = { onDone: (msg: string) => void; onFail: (err: unknown) => void };
