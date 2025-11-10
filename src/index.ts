import type { ExecutionContext } from '@cloudflare/workers-types';
import { createSchema, createYoga } from 'graphql-yoga';

const DEFAULT_MODEL = 'gpt-3.5-turbo';

type Env = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
};

type GraphQLContext = {
  env: Env;
};

type ServiceStatus = {
  message: string;
  model?: string | null;
  url?: string;
};

type ChatInput = {
  message: string;
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

function getServiceStatus(env: Env, url: string): ServiceStatus {
  return {
    message: env.OPENAI_API_KEY ? '服务可用' : '缺少 OPENAI_API_KEY',
    model: env.OPENAI_MODEL ?? DEFAULT_MODEL,
    url
  };
}

const typeDefs = /* GraphQL */ `
  type ServiceStatus {
    message: String!
    model: String
  }

  type AIMessage {
    content: String!
    model: String!
    finishReason: String
  }

  input ChatInput {
    message: String!
  }

  type Query {
    status: ServiceStatus!
  }

  type Mutation {
    generateResponse(input: ChatInput!): AIMessage!
  }
`;

const yoga = createYoga<GraphQLContext>({
  schema: createSchema({
    typeDefs,
    resolvers: {
      Query: {
        status: (_parent, _args, context) => getServiceStatus(context.env, '1')
      },
      Mutation: {
        generateResponse: async (_parent, args: { input: ChatInput }, context) => {
          return callOpenAI(args.input.message, context.env);
        }
      }
    }
  }),
  context: ({ env }) => ({ env }),
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  graphqlEndpoint: '/',
  // fetchAPI: { Request, Response, Headers }
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      return new Response(JSON.stringify(getServiceStatus(env, request.url)), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return yoga.fetch(request, { env });
  }
};
