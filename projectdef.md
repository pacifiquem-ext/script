# script: AI-Powered Document Management

This document serves as the technical summary of the **script** frontend. It is designed to provide a backend agent with a clear understanding of the existing UI capabilities and the necessary data structures to build a fully functional backend system.

---

## 1. Project Overview
**script** is a streamlined platform focused on **Document Management + AI**. It allows users to ingest documents from various sources and interact with them using an intelligent chat layer.

## 2. Frontend "Source of Truth"
The frontend is built with **React 18**, **Vite**, and **TypeScript**. It utilizes **Tailwind CSS** and **Align-UI** for a premium aesthetic.

### Core UI Standards:
- **Primary Color**: `#00B258` (Green).
- **Border Radius**: `rounded-20` (20px) for all modals.
- **Iconography**: Strictly **Huge Icons**.
- **Button Rule**: All buttons are `w-fit` with consistent padding.

---

## 3. Existing Frontend Capabilities (App Layout)

### A. Library (Document Management)
- **File Hierarchy**: Displays folders and files in a nested structure.
- **Smart Ingestion (Multi-source)**:
    - **Local**: Drag-and-drop or browse.
    - **Cloud Providers**: UI for Google Drive, Dropbox, OneDrive, and Box. Supports hierarchical browsing and multi-file selection within the provider's modal.
    - **URL Import**: Direct document import via URL.
- **Import Progress**: Visual progress bar for bulk ingestion.
- **Context Actions**: Move, delete, and view file metadata.

### B. AI Chat (Contextual Intelligence)
- **Persistent Input**: A global chat bar at the bottom of the app.
- **Context Ingestion**: Supports drag-and-drop ingestion where a user can drop a document from the Library into the chat to load it as context.
- **Message History**: UI for streaming AI responses and maintaining conversation threads.

### C. Settings & Integrations
- **Account Connections**: An "Integrations" tab to connect/disconnect cloud storage providers.
- **Workspace Management**: UI for switching between different legal/document workspaces.
- **Developer Tools**: UI for generating and managing API keys.
- **Security**: Password management and authentication settings.

### D. Authentication Flow
- **Complete Auth**: Signup, Login, OTP Verification, and Password Reset screens are fully implemented and styled.

---

## 4. Backend Requirements (To Support Frontend)

### I. Document Processing API
- **CRUD Operations**: Manage the folder/file tree structure.
- **OCR & Vectorization**: Backend must extract text and create embeddings for every document imported into the Library to enable AI context.
- **Metadata**: Store and serve document details (page count, source, creation date).

### II. AI RAG Engine
- **Search & Retrieval**: Backend must perform semantic search across the Library based on chat input.
- **Context Injection**: Ability to handle specific file references passed from the frontend "drop" action.

### III. Integration Gateway (OAuth)
- **Provider Bridges**: Implement OAuth flows for Drive, Dropbox, etc.
- **File Streaming**: Backend must handle the actual transfer of files from external providers to internal storage when the frontend triggers an "Import".

### IV. Authentication Service
- **JWT / Session**: Power the existing Login/Signup/OTP flows.
- **Workspace Siloing**: Ensure every API request is scoped to the user's active workspace.

---

## 5. Key Frontend Files for Reference
- `src/pages/app/LibraryPage.tsx`: Main document management logic.
- `src/pages/app/ChatPage.tsx`: AI interaction layer.
- `src/pages/app/SettingsModal.tsx`: Account and integration management.
- `src/components/ui/BrandIcons.tsx`: Custom provider icons.
