import { fetch as expoFetch } from 'expo/fetch';
import { ToolDefinition } from './tools';

interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string | any[]; tool_calls?: any[]; tool_call_id?: string }[];
  maxTokens?: number;
}

interface ChatRequestWithTools extends ChatRequest {
  tools?: ToolDefinition[];
}

interface ChatCompletionChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }[];
  };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
}

export interface StreamChatCompletionResult {
  content: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  finish_reason?: string;
}

/**
 * 非流式 chat completions（Tool Use 阶段使用）
 */
export async function chatCompletion(
  request: ChatRequestWithTools
): Promise<ChatCompletionResponse> {
  const { baseUrl, apiKey, model, messages, maxTokens, tools } = request;

  const url = `${baseUrl.trim().replace(/\/$/, '')}/chat/completions`;

  const body: Record<string, any> = {
    model,
    messages,
    stream: false,
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

export async function streamChatCompletion(
  request: ChatRequestWithTools,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<StreamChatCompletionResult> {
  const { baseUrl, apiKey, model, messages, maxTokens, tools } = request;

  const url = `${baseUrl.trim().replace(/\/$/, '')}/chat/completions`;

  const body: Record<string, any> = {
    model,
    messages,
    stream: true,
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await expoFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: string | undefined;
  const toolCallParts: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[] = [];

  const handleJson = (json: any) => {
    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }

    const delta = choice.delta || {};
    if (delta.content) {
      content += delta.content;
      onToken(delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const partial of delta.tool_calls) {
        const index = partial.index ?? toolCallParts.length;
        if (!toolCallParts[index]) {
          toolCallParts[index] = {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
        }

        const target = toolCallParts[index];
        if (partial.id) target.id = partial.id;
        if (partial.type) target.type = partial.type;
        if (partial.function?.name) {
          target.function.name += partial.function.name;
        }
        if (partial.function?.arguments) {
          target.function.arguments += partial.function.arguments;
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        handleJson(JSON.parse(trimmed.slice(6)));
      } catch {
        // skip malformed JSON
      }
    }
  }

  const toolCalls = toolCallParts.filter(
    (tc) => tc.id && tc.function.name
  );

  return {
    content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finish_reason: finishReason,
  };
}

export async function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const { baseUrl, apiKey, model, messages, maxTokens } = request;

  const url = `${baseUrl.trim().replace(/\/$/, '')}/chat/completions`;

  const body: Record<string, any> = {
    model,
    messages,
    stream: true,
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  const response = await expoFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          onToken(delta);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}
