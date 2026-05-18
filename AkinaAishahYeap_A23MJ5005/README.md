# DHL Knowledge Article Generator
#Authours
Akina Aishah Yeap | Web Technology (SECJ3483)

Web Technology Project (SECJ3483)

## Project Overview

The DHL Knowledge Article Generator is a web-based system that transforms messy operational messages, emails, PDFs, DOCX files, and raw notes into structured SOP and Knowledge Base (KB) articles automatically.

The system is designed to simulate DHL operational support workflows by standardizing issue handling, improving documentation consistency, and supporting operational automation through UiPath RPA.

---

# Technologies Used

## Frontend
- React.js
- CSS
- Axios
- Vite

## Main backend technologies:
- Node.js
- Express.js
- Multer
- Mammoth (.docx parsing)
- PDF-Parse (.pdf parsing)

## Automation
- UiPath Studio

---

# Features

## Knowledge Article Generation
- Convert raw operational text into SOP articles
- Automatic issue categorization
- Auto-generated resolution steps
- Escalation workflow generation

## File Upload Support
- TXT
- DOCX
- PDF

## Knowledge Base Search
- Dynamic search filtering
- Search history dropdown
- Keyword-based article retrieval

## Workflow Management
- Draft
- Reviewed
- Published

## CRUD Functionality
- Create article
- Read article
- Update article status
- Delete article

## RPA Integration
UiPath automation simulates operational file collection and workflow automation.

---

# Sample DHL Operational Scenarios

- AUTH_401 Access Issue
- Invalid Routing Code
- POD Upload Failure
- Label Printer Failure
- Missing Postcode Validation
- New Staff Access Setup

---

# How To Run The Project

## Backend
Run the following commands to start the backend server.

This backend handles:
- SOP generation
- File parsing
- CRUD operations
- Knowledge base storage
- PDF/DOCX processing

```bash
cd backend
npm install
node server.js
```
The backend server runs on:

```text
http://localhost:5000
```
## Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on:
```text
http://localhost:5173
```

# UiPath Automation
The UiPath workflow performs:
- File collection automation
- Frontend launch automation
- Operational workflow simulation

# Project Structure
```text
frontend/
backend/
uploads/
README.md
```

# Academic Purpose

This project was developed for academic and demonstration purposes under the Web Technology course (SECJ3483).
