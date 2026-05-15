# DHL Knowledge Base Automation System

## Project Overview

The DHL Knowledge Base Automation System is a web application for converting raw logistics information into structured knowledge base articles. It supports authenticated users, document/text upload, article editing, status management, version history, and an administrative view for RPA extraction results.

The project was built for a university Web Technology assignment using Next.js, TypeScript, Supabase, and PostgreSQL. It focuses on a realistic DHL logistics workflow where unstructured information can be stored, reviewed, and managed as reusable operational knowledge.

## Main Features

- User authentication through Supabase Auth.
- Role-based profile records for `editor`, `reviewer`, and `admin`.
- Upload console for plain text, PDF, DOCX, and supported image files.
- Text extraction from uploaded files.
- AI-assisted draft generation with deterministic fallback processing.
- Knowledge article listing with search and filters.
- Article detail page with summary, procedure steps, tags, source document text, edit form, and history.
- Article version snapshots after edits.
- Status workflow for `draft`, `reviewed`, and `published` articles.
- Admin-only article deletion endpoint.
- RPA extraction results page for administrators.
- RPA document summarization endpoint using Gemini.
- Supabase Row Level Security policies for database access control.

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS, shadcn-style UI components |
| Backend | Next.js App Router API routes |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Validation | Zod |
| File Parsing | `pdf-parse`, `mammoth`, `tesseract.js` |
| AI Support | Gemini API, optional OpenAI API fallback |
| Tooling | ESLint, npm |

## System Roles

### editor

Editors are standard authenticated users. They can upload raw content, create draft articles, view articles, and edit articles they are allowed to update. In the current API logic, article editing is allowed for admins or for the original creator while the article is still in `draft` status.

### reviewer

The `reviewer` role exists in the database profile model for review-based workflows. It can be used to separate review users from editors and admins. The current implemented status transition endpoint is admin-only, so reviewer-specific transition permissions would require an additional policy/API update.

### admin

Admins have elevated permissions. In the current implementation, admins can:

- Change article status.
- Delete articles through the API.
- Access RPA extraction results.
- Delete RPA extracted document records.
- Generate or regenerate AI summaries for RPA extracted documents.

## Database Overview

The database schema is located in [`supabase/schema.sql`](supabase/schema.sql). Row Level Security policies are located in [`supabase/policies.sql`](supabase/policies.sql).

### `profiles`

Stores application profile information linked to Supabase Auth users.

Main fields:

- `id`
- `full_name`
- `email`
- `role`
- `created_at`

### `source_documents`

Stores uploaded or pasted source content before it becomes a knowledge article.

Main fields:

- `id`
- `original_name`
- `file_type`
- `storage_path`
- `extracted_text`
- `normalized_text`
- `content_hash`
- `uploaded_by`
- `uploaded_at`

### `knowledge_articles`

Stores the main knowledge article records.

Main fields:

- `id`
- `title`
- `summary`
- `status`
- `creator_id`
- `source_document_id`
- `current_version_number`
- `duplicate_flag`
- `conflict_flag`
- `created_at`
- `updated_at`

### `article_steps`

Stores ordered procedure steps for an article.

Main fields:

- `id`
- `article_id`
- `step_number`
- `step_text`

### `article_tags`

Stores tags assigned to knowledge articles.

Main fields:

- `id`
- `article_id`
- `tag_name`

### `article_versions`

Stores version snapshots when article content is changed.

Main fields:

- `id`
- `article_id`
- `version_number`
- `title`
- `summary`
- `status_at_that_time`
- `edited_by`
- `change_note`
- `snapshot_json`
- `created_at`

### `status_history`

Stores the article status transition history.

Main fields:

- `id`
- `article_id`
- `old_status`
- `new_status`
- `changed_by`
- `changed_at`
- `note`

### `processing_logs`

Stores processing events such as extraction and AI processing logs.

Main fields:

- `id`
- `source_document_id`
- `document_storage_path`
- `stage`
- `message`
- `level`
- `created_at`

### `rpa_extracted_documents`

Stores document extraction records created for the RPA results workflow.

Main fields:

- `id`
- `processing_log_id`
- `document_url`
- `file_name`
- `file_type`
- `extracted_text`
- `extraction_status`
- `error_message`
- `ai_summary`
- `ai_key_points`
- `ai_summary_status`
- `summarized_at`
- `extracted_at`

## API Endpoints

Most API routes require an authenticated Supabase session. Examples below show JSON structure and URL usage. Replace `:id` with a real article UUID.

### `GET /api/articles`

Lists knowledge articles and supports filters.

Example:

```http
GET /api/articles?status=draft&search=customs&tag=shipping
```

Successful response:

```json
[
  {
    "id": "article-uuid",
    "title": "Customs Documentation Procedure",
    "status": "draft",
    "creator_id": "user-uuid",
    "article_tags": [
      { "tag_name": "shipping" }
    ]
  }
]
```

### `GET /api/articles/:id`

Returns a single article with steps, tags, and creator profile information.

Example:

```http
GET /api/articles/00000000-0000-0000-0000-000000000003
```

Successful response:

```json
{
  "id": "00000000-0000-0000-0000-000000000003",
  "title": "DHL Shipment Issue Handling Procedure",
  "summary": "This article explains shipment issue handling.",
  "status": "draft",
  "article_steps": [
    {
      "step_number": 1,
      "step_text": "Receive the shipment issue details."
    }
  ],
  "article_tags": [
    {
      "tag_name": "shipment"
    }
  ]
}
```

### `PATCH /api/articles/:id`

Updates article content and creates a new version record.

Example request:

```http
PATCH /api/articles/00000000-0000-0000-0000-000000000003
Content-Type: application/json
```

```json
{
  "title": "Updated DHL Shipment Issue Handling Procedure",
  "summary": "Updated summary for the article.",
  "steps": [
    "Receive shipment issue details.",
    "Verify the tracking number.",
    "Assign the case to the correct department."
  ],
  "tags": ["shipment", "support", "tracking"],
  "changeNote": "Updated procedure steps"
}
```

Successful response:

```json
{
  "success": true,
  "version": 2
}
```

### `DELETE /api/articles/:id`

Deletes an article. This endpoint is restricted to admins.

Example:

```http
DELETE /api/articles/00000000-0000-0000-0000-000000000003
```

Successful response:

```json
{
  "message": "Article deleted successfully",
  "deletedArticle": {
    "id": "00000000-0000-0000-0000-000000000003",
    "title": "DHL Shipment Issue Handling Procedure"
  }
}
```

### `PATCH /api/articles/:id/status`

Changes the status of an article. This endpoint is restricted to admins.

Allowed transitions:

| Current Status | Allowed Next Status |
| --- | --- |
| `draft` | `reviewed` |
| `reviewed` | `published`, `draft` |
| `published` | `draft` |

Example request:

```http
PATCH /api/articles/00000000-0000-0000-0000-000000000003/status
Content-Type: application/json
```

```json
{
  "newStatus": "reviewed",
  "note": "Article checked and ready for publishing review."
}
```

Successful response:

```json
{
  "success": true,
  "oldStatus": "draft",
  "newStatus": "reviewed"
}
```

## Article Filters

The `GET /api/articles` endpoint supports the following query parameters:

| Filter | Description | Example |
| --- | --- | --- |
| `status` | Filters articles by workflow status. Supported values are `draft`, `reviewed`, `published`, or `all`. | `/api/articles?status=published` |
| `search` | Searches article titles using a case-insensitive match. | `/api/articles?search=customs` |
| `tag` | Filters articles by exact tag name after articles are fetched. | `/api/articles?tag=shipping` |
| `creatorId` | Filters articles by creator UUID. | `/api/articles?creatorId=user-uuid` |
| `from` | Filters articles created on or after a date or timestamp. | `/api/articles?from=2026-05-01` |
| `to` | Filters articles created up to the end of the given date. | `/api/articles?to=2026-05-25` |

Filters can be combined:

```http
GET /api/articles?status=draft&search=parcel&tag=warehouse&from=2026-05-01&to=2026-05-25
```

## Environment Variables

Use `.env.example` as the template for local configuration. Create a `.env.local` file in the project root and fill in your own values.

Required keys:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional key:

```env
OPENAI_API_KEY=your_openai_api_key
```

Notes:

- Do not commit `.env.local`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Use `.env.example` only for placeholder values.

## How to Run the Project Locally

### Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js 18 or higher** (download from [nodejs.org](https://nodejs.org))
- **npm** (comes with Node.js)
- **Git** (download from [git-scm.com](https://git-scm.com))
- A **Supabase account** (free tier available at [supabase.com](https://supabase.com))
- A **Google Gemini API key** (free tier available at [aistudio.google.com](https://aistudio.google.com))
- *(Optional)* An **OpenAI API key** for fallback AI support

### Step 1: Clone the Repository

```bash
git clone https://github.com/devMo76/DHL_Automation_Project.git
cd DHL_Automation_Project
```

If you want to use a specific branch or checkpoint:

```bash
git checkout checkpoint/bf7cdf4
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including Next.js, React, TypeScript, Supabase client, file parsers, and UI components.

### Step 3: Set Up Supabase Backend

#### 3.1 Create a Supabase Project

1. Visit [supabase.com](https://supabase.com) and sign up or log in
2. Click **New Project** and fill in the project details:
   - Project name: `DHL-Automation` (or your preferred name)
   - Database password: Create a strong password and save it
   - Region: Select a region closest to you
3. Wait for the project to initialize (this may take a few minutes)

#### 3.2 Retrieve API Keys

1. In the Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** → Use as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon (public) key** → Use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → Use as `SUPABASE_SERVICE_ROLE_KEY` (keep this private!)

#### 3.3 Set Up Database Schema

1. In Supabase dashboard, navigate to **SQL Editor**
2. Click **New query**
3. Copy the entire contents of `supabase/schema.sql` from this repository into the query editor
4. Click **Run** to execute
5. Wait for the schema to be created successfully
6. Create a new query again and paste the contents of `supabase/policies.sql`
7. Click **Run** to apply Row Level Security policies
8. *(Optional)* For demo/test data, run `supabase/seed.sql` in the same manner

#### 3.4 Create Storage Bucket

1. In Supabase dashboard, go to **Storage**
2. Click **Create Bucket** or **New Bucket**
3. Name it exactly: `uploads`
4. Uncheck "Make it private" to allow public access (or configure policies as needed)
5. Click **Create**

### Step 4: Configure API Keys

#### 4.1 Get Google Gemini API Key (Required)

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Select your project or create a new one
5. Copy the generated API key
6. Save it for the environment setup

#### 4.2 Get OpenAI API Key (Optional)

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Navigate to **API Keys** section
4. Click **Create new secret key**
5. Copy the key (it will only be shown once)
6. Save it for the environment setup (optional, used as fallback only)

### Step 5: Create Environment Configuration File

1. In the project root directory, create a new file named `.env.local`
2. Copy the contents of `.env.example` into `.env.local`:

```bash
cp .env.example .env.local
```

3. Open `.env.local` and fill in your actual values:

```env
# Supabase Configuration (from Step 3.2)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Service Role (KEEP SECRET - Server-only)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI API Keys
GEMINI_API_KEY=AIzaSyD...
OPENAI_API_KEY=sk-... # Optional

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**⚠️ Important Security Notes:**
- Never commit `.env.local` to Git (it's in `.gitignore`)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or client-side requests
- Treat these keys like passwords - keep them secure and private

### Step 6: Create Test Users

#### 6.1 Create Users in Supabase Auth

1. Go to Supabase dashboard → **Authentication** → **Users**
2. Click **Add User** or **Invite User**
3. Enter an email and password for your test user
4. Click **Send Invite** or **Create User**
5. Create at least 2 users with different roles:
   - One for testing as an `editor`
   - One for testing as an `admin`

#### 6.2 Assign Roles to Users

1. Go to Supabase dashboard → **SQL Editor**
2. Create a new query and run the following SQL for each user:

For an admin user (replace `user-uuid-here` with the actual user ID):
```sql
UPDATE profiles 
SET role = 'admin' 
WHERE id = 'user-uuid-here';
```

For an editor user:
```sql
UPDATE profiles 
SET role = 'editor' 
WHERE id = 'user-uuid-here';
```

For a reviewer user:
```sql
UPDATE profiles 
SET role = 'reviewer' 
WHERE id = 'user-uuid-here';
```

**To find a user's UUID:**
1. Go to **Authentication** → **Users**
2. Click on the user to view details
3. Copy the **User UID** value

### Step 7: Start the Development Server

```bash
npm run dev
```

You should see output similar to:
```
  ▲ Next.js 16.2.6
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.3s
```

### Step 8: Access the Application

1. Open your web browser and navigate to: **http://localhost:3000**
2. You will be redirected to the authentication page
3. Sign in with one of your test user credentials
4. Upon successful login, you'll be taken to the dashboard
5. Start creating and managing knowledge articles!

### Troubleshooting Common Issues

| Issue | Solution |
|-------|----------|
| **"Error: Missing required environment variables"** | Verify all required keys in `.env.local` are filled correctly. Check for typos in variable names. |
| **"Supabase connection failed"** | Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct. Check your Supabase project is active. |
| **"Authentication/login fails"** | Ensure test users exist in Supabase Authentication. Verify the `profiles` table has entries for each user with their UUID and role. |
| **"File upload fails or storage bucket error"** | Confirm the `uploads` bucket exists in Supabase Storage. Check bucket access permissions are set correctly. |
| **"AI generation not working"** | Verify `GEMINI_API_KEY` is valid and has active quota. Check Google Cloud API console for usage limits. |
| **"Port 3000 already in use"** | Run on a different port: `npm run dev -- -p 3001` |
| **"Module not found errors"** | Delete `node_modules` folder and `.next` folder, then run `npm install` again. |
| **"TypeScript errors during build"** | Run `npm run build` to check for compilation errors. Review the error messages and fix type issues. |

### Additional Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server at http://localhost:3000 |
| `npm run build` | Create optimized production build |
| `npm run start` | Start production server (requires `npm run build` first) |
| `npm run lint` | Run ESLint to check code quality |

### Verify Your Setup

After completing all steps, test the following to ensure proper installation:

✓ Application loads at http://localhost:3000  
✓ Login page appears and accepts your test credentials  
✓ Dashboard loads after successful login  
✓ You can navigate to the upload/article creation page  
✓ Text upload creates a draft article successfully  
✓ Article list displays with search/filter functionality  
✓ Admin user can change article status  
✓ Run `npm run build` completes without errors  
✓ Run `npm run lint` passes without errors  

Congratulations! Your local development environment is now set up and ready to use.

## Security Features

- **Supabase authentication:** Protected pages and API routes check the current Supabase user session.
- **Row Level Security:** SQL policy files enable database-level access control for application tables.
- **Admin-only delete:** `DELETE /api/articles/:id` requires an authenticated admin profile.
- **Admin-only status changes:** `PATCH /api/articles/:id/status` requires an authenticated admin profile.
- **Status validation:** Article status transitions are restricted to valid workflow movements.
- **UUID validation:** Article and document IDs are validated before database queries.
- **Zod request validation:** Article update and status update payloads are validated before processing.
- **Server-only service role usage:** Service role access is kept in server-side code for admin-level operations.
- **Environment isolation:** Real secrets should be stored in `.env.local`, which is excluded from Git.

## Testing Checklist

Use this checklist before submission or demonstration.

- Login works for a valid Supabase user.
- Unauthenticated users are redirected away from protected dashboard pages.
- Text upload creates a draft article.
- PDF upload extracts text and creates a draft article.
- DOCX upload extracts text and creates a draft article.
- Image upload works when OCR language data is available.
- Article list loads successfully.
- Article search by title works.
- Status filter works.
- Tag filter works.
- Creator filter works through the API.
- Date range filters work through the API.
- Article detail page displays summary, steps, tags, and source text.
- Article edit creates a new version.
- Version history displays saved article versions.
- Admin can move an article from `draft` to `reviewed`.
- Admin can move an article from `reviewed` to `published`.
- Invalid status transitions are rejected.
- Non-admin users cannot change article status.
- Admin can delete an article through the API.
- Non-admin users cannot delete articles.
- RPA results page is restricted to admins.
- RPA summary generation works when `GEMINI_API_KEY` is configured.
- `npm run lint` passes.
- `npm run build` passes.

## Future Improvements

- Add a dedicated reviewer workflow where reviewers can approve drafts separately from admins.
- Add a visible delete button in the article management UI for admins.
- Add API-key-based RPA ingestion endpoints for UiPath integration.
- Add automated tests for API routes and role permissions.
- Add stronger database cascade rules or transaction handling for article deletion.
- Add more detailed audit fields such as reviewed by, published by, and final approval note.
- Add pagination for large article lists.
- Add full-text search across title, summary, steps, and extracted source text.
- Add export options for published knowledge articles.
- Add dashboard charts for article status counts and processing activity.
