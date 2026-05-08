<div align="center">

```
 ██████╗██╗  ██╗██████╗  ██████╗ ███╗   ███╗ █████╗
██╔════╝██║  ██║██╔══██╗██╔═══██╗████╗ ████║██╔══██╗
██║     ███████║██████╔╝██║   ██║██╔████╔██║███████║
██║     ██╔══██║██╔══██╗██║   ██║██║╚██╔╝██║██╔══██║
╚██████╗██║  ██║██║  ██║╚██████╔╝██║ ╚═╝ ██║██║  ██║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝

███████╗██╗  ██╗██████╗ ██╗      ██████╗ ██████╗ ███████╗██████╗
██╔════╝╚██╗██╔╝██╔══██╗██║     ██╔═══██╗██╔══██╗██╔════╝██╔══██╗
█████╗   ╚███╔╝ ██████╔╝██║     ██║   ██║██████╔╝█████╗  ██████╔╝
██╔══╝   ██╔██╗ ██╔═══╝ ██║     ██║   ██║██╔══██╗██╔══╝  ██╔══██╗
███████╗██╔╝ ██╗██║     ███████╗╚██████╔╝██║  ██║███████╗██║  ██║
╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

A desktop application for exploring and managing ChromaDB vector databases. Built with Electron and React.

![Chroma Explorer](assets/screenshot.png)

</div>

## Fork Notice

This is a Linux-focused fork of [stepandel/chroma-explorer](https://github.com/stepandel/chroma-explorer), pinned to the **`chromadb@1.8.1`** JS client so it can talk to **Chroma 0.x servers** (which expose the legacy `/api/v1` REST API).

The upstream project ships the modern `chromadb@3.x` client, which only speaks the `/api/v2` API and uses a different surface (`CloudClient`, modular `@chroma-core/*` embedding packages, new error types, etc.) — that won't connect to a Chroma 0.x server. I needed to keep working against a Chroma 0.x deployment that hadn't been upgraded yet, so this fork rewinds the client and drops the 3.x-only dependencies. Most users should prefer upstream — only use this fork if you're stuck on a Chroma 0.x server and can't upgrade.

## Features

- **Multi-Profile Connections** - Connect to local, remote, or Chroma Cloud databases with saved profiles
- **Collection Management** - Create, copy, delete, and configure collections with custom embedding functions
- **Document Operations** - Browse, search, create, edit, and delete documents with batch support
- **Semantic Search** - Query documents using natural language with 13+ embedding providers
- **Metadata Filtering** - Filter documents with flexible query syntax
- **Resizable Layout** - Adjustable multi-panel interface with sidebar, table, and detail views

## Supported Embedding Providers

OpenAI, Cohere, Google Gemini, Ollama, HuggingFace Server, Mistral, Voyage AI, Together AI, Jina, Cloudflare Workers AI, Morph, Chroma Cloud Qwen, Sentence Transformer

## Tech Stack

- **Desktop**: Electron
- **Frontend**: React, TypeScript, Tailwind CSS
- **Data**: TanStack Query, TanStack Table
- **UI**: Radix UI components, Lucide icons
- **Database**: ChromaDB SDK

## Project Structure

```
├── electron/           # Main process (IPC handlers, ChromaDB service, window management)
├── src/
│   ├── windows/       # Window components (Setup, Connection, Settings)
│   ├── components/    # UI components (collections, documents, modals)
│   ├── context/       # React contexts (ChromaDB, Collections, Documents)
│   ├── hooks/         # Custom hooks
│   └── providers/     # Context providers
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Configuration

API keys for embedding providers can be configured in **Settings** (Cmd+,). Keys are stored encrypted at rest.

## License

MIT
