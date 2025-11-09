import { createSchema, createYoga } from 'graphql-yoga';

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

const typeDefs = /* GraphQL */ `
  type Query {
    status: ServiceStatus!
  }

  type Mutation {
    generateResponse(input: ChatInput!): AIMessage!
  }

  input ChatInput {
    message: String!
  }

  type AIMessage {
    content: String!
    model: String!
    finishReason: String
  }

  type ServiceStatus {
    message: String!
    model: String
  }
`;

const resolvers = {
  Query: {
    status: (_: unknown, __: unknown, context: { env: Env }) => {
      return {
        message: context.env.OPENAI_API_KEY ? '服务可用' : '缺少 OPENAI_API_KEY',
        model: context.env.OPENAI_MODEL ?? 'gpt-3.5-turbo'
      };
    }
  },
  Mutation: {
    generateResponse: async (params: any) => {
      console.log('generateResponse----params', params)
      //  _: unknown,
      // args: { input: { message: string } },
      // context: { env: Env }
      // console.log('Received message:', args.input.message);
      // const result = await callOpenAI(args.input.message, context.env);
      return { content: 'generateResponse respond' }
      // return result;
    }
  }
};

const schema = createSchema({
  typeDefs,
  resolvers
});

const yoga = createYoga<{ env: Env }>({
  schema,
  graphqlEndpoint: '/graphql',
  landingPage: false,
  context: ({ env }) => ({ env })
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
} as const;

async function callOpenAI(message: string, env: Env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const model = env.OPENAI_MODEL ?? 'gpt-3.5-turbo';
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
  console.log('Received response:', response);

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // if (request.method === 'OPTIONS') {
    //   return new Response(null, {
    //     status: 204,
    //     headers: corsHeaders
    //   });
    // }

    const handleRequest = yoga.fetch as unknown as (
      req: Request,
      env: Env,
      ctx: ExecutionContext
    ) => Promise<Response>;

    const response = await handleRequest(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
