# Legacy lesson generator

Status: **deprecated**.

The existing generator at `/generator` and its generation pipeline are preserved as a working internal reference for the future lesson generator. They are not part of the current lesson-creation flow.

## Boundaries

- Keep `/generator`, `/api/generator/config`, and `/api/lessons/generate` working for reference and regression checks.
- Do not link the legacy generator from the application navigation or the new-lesson modal.
- Do not build new product behavior on top of the legacy UI or API.
- Make only compatibility, security, and critical bug fixes here.
- Build the future generator as a separate flow; reuse legacy ideas deliberately rather than extending this surface in place.

The generated lesson storage, rendering, and validation modules may still be useful to the future implementation, but adopting them is a separate design decision.
