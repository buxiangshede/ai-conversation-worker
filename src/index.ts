const DEFAULT_MODEL = 'gpt-3.5-turbo';

type Env = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
};

type OpenAIChatChoice = {
  index: number;
  finish_reason?: string | null;
  message?: {
    role: string;
    content: string;
  };
};

type OpenAIChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
} as const;

function buildCorsHeaders(extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return headers;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = buildCorsHeaders(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

async function callOpenAI(message: string, env: Env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const model = env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data: OpenAIChatResponse = await response.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? '',
    model: data.model ?? model,
    finishReason: choice?.finish_reason ?? null
  };
}

function handleHealth(env: Env) {
  return jsonResponse({
    message: env.OPENAI_API_KEY ? '服务可用' : '缺少 OPENAI_API_KEY',
    model: env.OPENAI_MODEL ?? DEFAULT_MODEL
  });
}

async function handleOpenAIRequest(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: buildCorsHeaders()
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = typeof payload === 'object' && payload !== null ? (payload as { message?: unknown }).message : undefined;

  if (typeof message !== 'string' || !message.trim()) {
    return jsonResponse({ error: '`message` is required.' }, { status: 400 });
  }

  const data = await callOpenAI(message, env);
  return jsonResponse(data);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders()
      });
    }

    const { pathname } = new URL(request.url);

    try {
      if (pathname === '/health') {
        return handleHealth(env);
      }

      if (pathname === '/openai') {
        return await handleOpenAIRequest(request, env);
      }

      return new Response('Not Found', {
        status: 404,
        headers: buildCorsHeaders()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      return jsonResponse({ error: message }, { status: 500 });
    }
  }
};
