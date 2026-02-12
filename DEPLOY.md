# Global Deploy (Render) + Miro usage

## 1) Publish globally

1. Upload this folder to GitHub.
2. Open [Render](https://render.com) and create a new **Web Service** from that repo.
3. Render should pick `render.yaml` automatically.
4. Wait until deploy is green and copy your public URL, for example:
   - `https://english-mood-lab.onrender.com`

## 2) Teacher and student links

- Teacher link:
  - `https://YOUR-DOMAIN/?role=teacher&room=a2-lesson`
- Student link (auto-connect):
  - `https://YOUR-DOMAIN/?role=student&room=a2-lesson&autoconnect=1`

Room value can be any code (for example, `maria-friday`).

## 3) How to run lesson

1. Open teacher link on your device.
2. Open student link on student device.
3. In both tabs, if needed, click **Connect**.
4. Use **Teacher Dashboard**:
   - send student to section (`Warm-Up`, `Grammar`, etc.)
   - highlight by CSS selector (example: `#exercise-2`)
   - spotlight target vocabulary words.

## 4) In Miro

1. On Miro board choose embed website option.
2. Paste teacher or student link.
3. Use different room codes for parallel students.

## Notes

- Realtime sync is in-memory (single app instance). Keep one running web instance for one class room namespace.
- Free plan can sleep after inactivity; first open may take some seconds.
