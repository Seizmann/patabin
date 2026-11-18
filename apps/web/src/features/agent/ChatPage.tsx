import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import bn from 'i18n/bn';
import {
  createConversation,
  deleteConversation,
  listChatModels,
  listConversations,
  listMessages,
  renameConversation,
  streamChat,
  type ChatMessageRow,
  type Question,
  type StreamEvent,
} from './chat/api';

type State = {
  conversationId: string | null;
  messages: ChatMessageRow[];
  streamingText: string;
  status: 'idle' | 'streaming';
  error: string;
  fallbackNote: string;
  activeQuestion: Question[] | null;
};

type Action =
  | { type: 'SET_CONVERSATION'; id: string | null; messages: ChatMessageRow[] }
  | { type: 'APPEND_MESSAGE'; message: ChatMessageRow }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_TOKEN'; delta: string }
  | { type: 'STREAM_END' }
  | { type: 'ERROR'; message: string }
  | { type: 'FALLBACK'; note: string }
  | { type: 'QUESTION'; questions: Question[] | null }
  | { type: 'TOOL'; name: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_CONVERSATION':
      return { ...state, conversationId: action.id, messages: action.messages, streamingText: '', activeQuestion: null, fallbackNote: '', error: '' };
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'STREAM_START':
      return { ...state, status: 'streaming', streamingText: '', error: '', activeQuestion: null };
    case 'STREAM_TOKEN':
      return { ...state, streamingText: state.streamingText + action.delta };
    case 'STREAM_END':
      return { ...state, status: 'idle', streamingText: '' };
    case 'ERROR':
      return { ...state, status: 'idle', error: action.message };
    case 'FALLBACK':
      return { ...state, fallbackNote: action.note };
    case 'QUESTION':
      return { ...state, activeQuestion: action.questions, status: 'idle', streamingText: '' };
    case 'TOOL':
      return state;
  }
}

export default function ChatPage() {
  usePageTitle(bn.agentChat);
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(reducer, {
    conversationId: null,
    messages: [],
    streamingText: '',
    status: 'idle',
    error: '',
    fallbackNote: '',
    activeQuestion: null,
  });
  const [input, setInput] = useState('');
  const [modelId, setModelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isPending: convsPending } = useQuery({ queryKey: ['agent-conversations'], queryFn: listConversations });
  const { data: models = [] } = useQuery({ queryKey: ['agent-chat-models'], queryFn: listChatModels });

  useEffect(() => {
    if (!modelId && models.length > 0) {
      const def = models.find((m) => m.is_default) ?? models[0];
      if (def) setModelId(def.model_id);
    }
  }, [models, modelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.messages, state.streamingText, state.activeQuestion]);

  const openConversation = async (id: string | null) => {
    abortRef.current?.abort();
    const messages = id ? await listMessages(id) : [];
    dispatch({ type: 'SET_CONVERSATION', id, messages });
    setDrawerOpen(false);
    void qc.invalidateQueries({ queryKey: ['agent-conversations'] });
  };

  const lastQuestion = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (!m) return null;
      if (m.role === 'user') return null;
      if (m.role === 'assistant' && m.event?.type === 'question' && Array.isArray(m.event.questions)) {
        return m.event.questions as Question[];
      }
    }
    return null;
  }, [state.messages]);

  const send = async (text: string, answerTo: string | null) => {
    const message = text.trim();
    if (!message || state.status === 'streaming') return;
    setInput('');
    dispatch({ type: 'STREAM_START' });
    const controller = new AbortController();
    abortRef.current = controller;
    let conversationId = state.conversationId;
    let sawQuestion: Question[] | null = null;
    let errorMsg = '';
    try {
      await streamChat(
        { conversationId, message, modelId: modelId || null, answerTo },
        (e: StreamEvent) => {
          switch (e.name) {
            case 'meta':
              conversationId = String(e.payload.conversation_id ?? '');
              break;
            case 'token':
              dispatch({ type: 'STREAM_TOKEN', delta: String(e.payload.delta ?? '') });
              break;
            case 'tool_call':
              dispatch({ type: 'TOOL', name: String(e.payload.name ?? '') });
              dispatch({
                type: 'APPEND_MESSAGE',
                message: { id: `live-tool-${Date.now()}-${Math.random()}`, seq: 0, role: 'tool', content: null, tool_name: String(e.payload.name ?? ''), tool_call_id: null, model_id: null, event: null },
              });
              break;
            case 'question':
              sawQuestion = (e.payload.questions as Question[]) ?? [];
              break;
            case 'model_fallback':
              dispatch({ type: 'FALLBACK', note: `${String(e.payload.from)} ${bn.agentFallbackNote} ${String(e.payload.to)}` });
              break;
            case 'error':
              errorMsg = String(e.payload.message_bn ?? bn.agentErrorGeneric);
              break;
          }
        },
        controller.signal,
      );
      if (errorMsg) {
        dispatch({ type: 'ERROR', message: errorMsg });
      } else if (sawQuestion) {
        dispatch({ type: 'QUESTION', questions: sawQuestion });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        dispatch({ type: 'ERROR', message: bn.agentTestUnreachable });
      }
    }
    dispatch({ type: 'STREAM_END' });
    abortRef.current = null;
    await refreshMessages(conversationId);
  };

  const refreshMessages = async (conversationId: string | null) => {
    if (!conversationId) return;
    const messages = await listMessages(conversationId).catch(() => state.messages);
    dispatch({ type: 'SET_CONVERSATION', id: conversationId, messages });
    void qc.invalidateQueries({ queryKey: ['agent-conversations'] });
  };

  const submitAnswer = async (answers: { id: string; value: string }[]) => {
    const questions = lastQuestion ?? state.activeQuestion ?? [];
    const text = answers
      .map((a) => {
        const q = questions.find((q) => q.id === a.id);
        return `${q ? q.text : a.id}: ${a.value}`;
      })
      .join('\n');
    dispatch({ type: 'QUESTION', questions: null });
    await send(text, answers[0]?.id ?? null);
  };

  const newConversation = async () => {
    const id = await createConversation(bn.agentNewChat);
    await openConversation(id);
  };

  const removeConversation = async (id: string) => {
    if (!window.confirm(bn.agentDeleteConfirm)) return;
    await deleteConversation(id);
    if (state.conversationId === id) await openConversation(null);
    void qc.invalidateQueries({ queryKey: ['agent-conversations'] });
  };

  const rename = async (id: string) => {
    const title = window.prompt(bn.agentRenamePrompt);
    if (!title?.trim()) return;
    await renameConversation(id, title.trim());
    void qc.invalidateQueries({ queryKey: ['agent-conversations'] });
  };

  const disabled = state.status === 'streaming';

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-5xl flex-col gap-3 lg:h-[calc(100dvh-6rem)]">
      <PageTitle tag="PataBin" title={bn.agentChat} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.fallbackNote && <Notice tone="info">{state.fallbackNote}</Notice>}

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className={`${drawerOpen ? 'fixed inset-0 z-40 block bg-canvas p-4' : 'hidden'} w-full flex-col gap-3 lg:relative lg:z-auto lg:flex lg:w-64 lg:shrink-0 lg:bg-transparent lg:p-0`}>
          <div className="flex items-center justify-between lg:hidden">
            <p className="p-label">{bn.agentChats}</p>
            <Btn variant="ghost" onClick={() => setDrawerOpen(false)}>{bn.cancel}</Btn>
          </div>
          <div className="max-w-40">
            <Btn onClick={() => void newConversation()}>{bn.agentNewChat}</Btn>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {convsPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`card flex items-center gap-2 px-3 py-2 ${state.conversationId === c.id ? 'ring-1 ring-cocoa' : ''}`}
                >
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => void openConversation(c.id)}>
                    {c.title || bn.agentNewChat}
                  </button>
                  <button type="button" aria-label={bn.agentRename} className="p-caption text-ink-mute underline" onClick={() => void rename(c.id)}>
                    {bn.agentEdit}
                  </button>
                  <button type="button" aria-label={bn.delete} className="p-caption text-bad underline" onClick={() => void removeConversation(c.id)}>
                    {bn.delete}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <Card className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2 lg:hidden">
            <Btn variant="ghost" onClick={() => setDrawerOpen(true)}>{bn.agentChats}</Btn>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {state.messages.length === 0 && !state.streamingText && !state.activeQuestion && (
              <p className="p-caption text-center text-ink-mute">{bn.agentEmptyChat}</p>
            )}
            <div className="flex flex-col gap-3">
              {state.messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
              {state.streamingText && (
                <div className="max-w-[85%] self-start rounded-2xl bg-surface px-4 py-2 text-sm whitespace-pre-wrap">{state.streamingText}</div>
              )}
              {state.activeQuestion && <QuestionCard questions={state.activeQuestion} onSubmit={(a) => void submitAnswer(a)} />}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                className="field min-h-11 flex-1 resize-none"
                rows={1}
                value={input}
                placeholder={bn.agentInputPlaceholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input, null);
                  }
                }}
              />
              {disabled ? (
                <Btn variant="ghost" onClick={() => abortRef.current?.abort()}>{bn.agentStop}</Btn>
              ) : (
                <Btn disabled={!input.trim()} onClick={() => void send(input, null)}>{bn.agentSend}</Btn>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="p-caption text-ink-mute">{bn.agentModel}</span>
              <select className="field max-w-56" value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label={bn.agentModel}>
                {models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessageRow }) {
  if (message.role === 'tool') {
    return (
      <details className="self-center">
        <summary className="p-caption cursor-pointer text-ink-mute">{bn.agentToolActivity} · {message.tool_name}</summary>
        <pre className="p-caption mt-1 max-w-md overflow-x-auto whitespace-pre-wrap">{message.content}</pre>
      </details>
    );
  }
  if (message.role === 'event') {
    const ev = message.event;
    const note = ev?.type === 'answer' ? message.content : ev?.type === 'question' ? bn.agentQuestionSent : message.content;
    return <p className="p-caption self-center text-ink-mute">{note}</p>;
  }
  if (message.role === 'user') {
    return (
      <div className="max-w-[85%] self-end rounded-2xl bg-cocoa px-4 py-2 text-sm whitespace-pre-wrap text-white">
        {message.content}
      </div>
    );
  }
  return <div className="max-w-[85%] self-start rounded-2xl bg-surface px-4 py-2 text-sm whitespace-pre-wrap">{message.content}</div>;
}

function QuestionCard({ questions, onSubmit }: { questions: Question[]; onSubmit: (answers: { id: string; value: string }[]) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ready = questions.every((q) => (answers[q.id] ?? '').trim() !== '');
  return (
    <Card className="flex flex-col gap-3 self-stretch p-4">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <p className="p-title text-sm">{q.text}</p>
          {q.options && q.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`rounded-full border border-hairline px-3 py-1 text-sm ${answers[q.id] === o.value ? 'bg-cocoa text-white' : 'bg-canvas'}`}
                  onClick={() => setAnswers((cur) => ({ ...cur, [q.id]: o.value }))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <input
              className="field"
              inputMode={q.kind === 'number' ? 'decimal' : 'text'}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="max-w-40">
        <Btn disabled={!ready} onClick={() => onSubmit(questions.map((q) => ({ id: q.id, value: answers[q.id] ?? '' })))}>
          {bn.agentAnswerSend}
        </Btn>
      </div>
    </Card>
  );
}
