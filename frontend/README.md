# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

### UptimeRobot Ping Status Page

https://stats.uptimerobot.com/TlahFoPKmf

### System Architecture
```mermaid
graph TD
    %% -- User Interaction --
    subgraph Client [User in Dubai]
        A[User types Legal Query] --> B(React Frontend - Vercel)
    end

    %% -- Security & Routing --
    B -->|HTTPS POST| C{Render Backend Proxy}
    C -.->|loads| D(.env File)
    D -.->|injected| E(GOOGLE_API_KEY)
    
    %% -- Data Flow (RAG) --
    subgraph RAG_Process [Backend Logic - Render]
        F(FastAPI Server) -->|Queries| G[(ChromaDB - Local Disk)]
        G -->|Retrieves Top 5 Chunks| F
        F -->|Augments Prompt| H(Augmented Input)
    end
    
    %% -- External AI --
    subgraph Gemini_API [Google AI Studio - Tier 1]
        I(Gemini 2.5 Flash-Lite) -->|Processes Input| J(Generates Answer)
    end

    %% -- Connections --
    C -->|Question| F
    H -->|Authorized API Call| I
    J -->|Answer| F
    F -->|Answer| C
    C -->|JSON Response| B
    
    %% -- Ingestion Flow (One-time/Batch) --
    subgraph Ingestion [Data Prep - Laptop/Render]
        K[Legal PDFs] -->|1. PyPDFLoader| L(Document Loading)
        L -->|2. Splitter (1000 chars)| M(Text Chunks)
        M -->|3. text-embedding-004| N(Embeddings)
        N -->|4. Store| G
    end

    %% -- Scaling/Cost Stats (Tier 1) --
    subgraph Stats [Tier 1 Capabilties]
        O[300 Requests/Min]
        P[1500 Requests/Day]
        Q[$0.10 / 1M Tokens]
        R[~4000 Legal Queries/$1]
    end

    %% -- Styling --
    style B fill:#3b82f6,stroke:#1e3a8a,color:white,rx:10,ry:10
    style C fill:#10b981,stroke:#065f46,color:white,rx:5,ry:5
    style E fill:#ef4444,stroke:#7f1d1d,color:white,stroke-width:2px
    style G fill:#f97316,stroke:#7c2d12,color:white,rx:10,ry:10
    style I fill:#8b5cf6,stroke:#4c1d95,color:white,rx:10,ry:10
    style Stats fill:#f1f5f9,stroke:#94a3b8,color:#1e293b,stroke-dasharray: 5 5