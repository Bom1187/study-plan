# Studyflow

Studyflow is a Thai-language study planner built with React, TypeScript, and Vite. Add subjects, exam dates, difficulty levels, topics, and your available days and hours; the app creates a study agenda locally, with breaks and pre-exam review sessions.

## Features

- Add and remove subjects with an exam date, difficulty, and a list of study topics.
- Choose available weekdays and a daily study time range.
- Generate or regenerate a plan using deterministic rules: upcoming exams first, then difficulty, within your selected availability.
- Mark topics as completed, move a study topic to another available day, or rebuild the remaining plan after a missed day.
- View the plan by day or as an upcoming schedule.
- Save the plan and study progress in the current browser using local storage.

Planning happens entirely in the browser. No AI service, API key, or network request is needed to create or update a schedule.

## Development

```sh
npm install
```

Start the app:

```sh
npm run dev
```

## Production

```sh
npm run build
npm start
```

The production server serves the built app. No external planning service is required.

## Validation

```sh
npm run build
npm run lint
npm test
```

Tests run locally and do not call external services.
