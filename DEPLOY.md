# Global Deploy (Render) + Miro usage

## 1) Publish globally

1. Upload this folder to GitHub.
2. Open [Render](https://render.com) and create a new **Web Service** from that repo.
3. Render should pick `render.yaml` automatically.
4. Wait until deploy is green and copy your public URL, for example:
   - `https://english-mood-lab.onrender.com`

## 2) Generator environment

Set these environment variables in Render:

- `OPENROUTER_API_KEY`: your OpenRouter API key.
- `TEACHER_ADMIN_TOKEN`: password/token used by the teacher UI for generation and deletion.
- `LESSONS_DIR`: optional. Defaults to `./data/lessons`.
- `USD_RUB_RATE`: optional. Defaults to `83`.
- `OPENROUTER_MODEL`: optional. Defaults to `deepseek/deepseek-v4-flash`.
- `OPENROUTER_REASONING_EFFORT`: optional. Defaults to `xhigh` (max reasoning for DeepSeek V4 Flash).

Open `/` for the teacher dashboard. Open `/generator` to generate lessons and manage
the generated lesson list.

Important for Render: generated lessons are saved as files. Add a persistent disk and point
`LESSONS_DIR` to it if lessons must survive redeploys, rebuilds, or instance replacement.

For local development, copy `.env.example` to `.env` and replace `OPENROUTER_API_KEY`
with your OpenRouter key. The server loads `.env` automatically on start.

## 3) Teacher and student links

- Teacher link:
  - `https://YOUR-DOMAIN/lesson/LESSON_ID?role=teacher&room=a2-lesson`
- Student link (auto-connect):
  - `https://YOUR-DOMAIN/lesson/LESSON_ID?role=student&room=a2-lesson&autoconnect=1`

Room value can be any code (for example, `maria-friday`).

The generator dashboard creates teacher/student links automatically.

## 4) How to run lesson

1. Open teacher link on your device.
2. Open student link on student device.
3. In both tabs, if needed, click **Connect**.
4. Use **Teacher Dashboard**:
   - send student to section (`Warm-Up`, `Grammar`, etc.)
   - highlight by CSS selector (example: `#exercise-2`)
   - spotlight target vocabulary words.
   - student sees teacher cursor in real time.
   - teacher still sees student cursor in real time.

## 5) In Miro

1. On Miro board choose embed website option.
2. Paste teacher or student link.
3. Use different room codes for parallel students.

## Notes

- Realtime sync is in-memory (single app instance). Keep one running web instance for one class room namespace.
- Free plan can sleep after inactivity; first open may take some seconds.
- Generated lesson storage is file-based. Without a persistent disk on Render, generated files are not durable.
