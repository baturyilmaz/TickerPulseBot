# Agent Starter

A starter project to help you get started with [OpenServ Labs SDK](https://github.com/openserv-labs/sdk) - a powerful TypeScript framework for building non-deterministic AI agents with advanced cognitive capabilities.

This starter provides a minimal setup to help you understand the basics of the SDK. For more advanced features like tasks, file operations, and inter-agent collaboration, check out the [SDK documentation](https://github.com/openserv-labs/sdk).

## Setup

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in your configuration:

```bash
cp .env.example .env
```

4. Update the environment variables in `.env`:
   - `OPENSERV_API_KEY`: Your OpenServ Labs API key
   - `PORT`: The port number for your agent's HTTP server (default: 7378)

## Using with OpenServ Platform

To use your agent with the OpenServ platform:

1. Start your agent locally using `npm run dev` or `npm start`
2. Use a tool like [ngrok](https://ngrok.com/) to expose your local server:
```bash
ngrok http 7378  # Replace 7378 with your PORT if different
```
3. Copy the ngrok URL (e.g., `https://your-agent.ngrok.io`)
4. Go to the OpenServ platform and add a new agent
5. Set the agent's endpoint URL to your ngrok URL
6. Your agent is now ready to use on the platform!

## Example Agent

The starter includes a simple example agent that can perform basic arithmetic:

```typescript
// Example usage
const response = await agent.process({
  messages: [
    {
      role: 'user',
      content: 'add 13 and 29'
    }
  ]
})
```

## Development

Run the development server with hot reload:

```bash
npm run dev
```

## Code Quality

The project uses ESLint and Prettier for code quality and formatting:

```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Format code with Prettier
npm run format
```

## Building

Build the project:

```bash
npm run build
```

Run the built version:

```bash
npm start
```

## Notes

- The project is set up with TypeScript, ts-node-dev for development, and includes VS Code debugging configuration
- Environment variables are validated using Zod
- ESLint and Prettier are configured for consistent code style
- The agent uses natural language processing to understand and execute commands

## Next Steps

Once you're comfortable with the basics, explore more advanced features in the [OpenServ Labs SDK](https://github.com/openserv-labs/sdk):
- Tasks and workflows
- Chat interactions
- File operations
- Custom capabilities
- Inter-agent collaboration
