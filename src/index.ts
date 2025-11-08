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
    generateResponse: async (
      _: unknown,
      args: { input: { message: string } },
      context: { env: Env }
    ) => {
      const result = await callOpenAI(args.input.message, context.env);
      return result;
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
  fetch: yoga.fetch
};
