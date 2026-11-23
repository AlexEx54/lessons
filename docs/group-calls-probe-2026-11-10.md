# Групповые звонки: локальная проба LiveKit (2026-11-10)

Проба перед разработкой групповых звонков. Проверялись допущения плана на
`livekit-server` 1.13.11 и `livekit-client` 2.23.0, headless Chrome, всё на одной
машине. Код продукта не менялся. Серверная часть пробы написана только на
встроенных модулях Node (`node:crypto`, `fetch`) — без серверного SDK LiveKit.

Конфигурация: `port: 7880` (HTTP/WS, только 127.0.0.1), `rtc.tcp_port: 7881`,
`rtc.udp_port: 7882` (один UDP-порт, без диапазона), одна пара ключей, webhook
на локальный приёмник.

## Итог

| # | Проверка | Вердикт | Главное |
|---|---|---|---|
| 1 | Токен на `node:crypto` (HS256) | работает | `exp` обязателен; верхний `name` — имя участника; `canPublishSources` соблюдается сервером |
| 2 | API сервера (Twirp по HTTP) | работает | `DeleteRoom` требует `roomCreate`, остальное — `roomAdmin` + `room` |
| 3 | Webhook-и | работает | `Authorization` — голый JWT; claim `sha256` = base64 от SHA-256 сырого тела |
| 4 | Срок жизни токена | работает | сервер сам выдаёт клиенту свежий токен каждые 5 минут; TTL 10 минут достаточно |
| 5 | Выдача TURN клиенту | работает | имя и пароль в формате coturn `use-auth-secret`; формула сверена |
| 6 | Бандл клиента | частично | 572 КБ / 150 КБ gzip; tree-shaking почти ничего не даёт |
| 7 | Звонок на четверых, свой видеотрек | работает | три слоя simulcast из canvas-трека; маленькая плитка получает 320×180 |
| 8 | Замена видеотрека на лету | работает | `replaceTrack` — без событий у собеседников, пауза до 200 мс |
| 9 | Выключение микрофона и камеры | работает | SDK ставит `enabled=false` на наш трек, но не останавливает его |
| 10 | Экран отдельным источником | работает | различается по `publication.source` |
| 11 | Удаление, завершение, дубль | работает | удалённый участник может войти снова с тем же токеном |
| 12 | Сигналинг за прокси под `/rtc` | работает | клиент ходит только на `/rtc/v1` и `/rtc/v1/validate` |
| 13 | Переподключение | частично | обрыв сокета — 2 с без потери медиа; перезапуск сервера зависит от сигнала |
| 14 | Говорящий, качество, `rtcConfig` | работает | `iceTransportPolicy: 'relay'` применяется |

## Факты для реализации

### Токен
- Заголовок `{alg: 'HS256', typ: 'JWT'}`; claims: `iss` (ключ API), `sub`
  (identity), `nbf`, `exp`, `name`, `metadata`, `video`.
- `video`: `room`, `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`,
  `canPublishSources: ['camera', 'microphone', 'screen_share']` (строки, не числа).
- Допуск по часам ±60 с.
- Публикация источника вне списка: клиент получает `PublishTrackError`
  «insufficient permissions», соединение остаётся.
- Сервер присылает клиенту новый токен на 10 минут сразу после входа и затем
  каждые 5 минут. Клиент использует его при переподключении. Своя логика
  обновления не нужна, пока клиент не был без связи дольше ~10 минут.

### API сервера
`POST http://127.0.0.1:7880/twirp/livekit.RoomService/<Метод>`, JSON,
`Authorization: Bearer <токен с правами>`.

| Метод | Права в токене | Тело |
|---|---|---|
| `ListParticipants` | `roomAdmin` + `room` | `{room}` |
| `MutePublishedTrack` | `roomAdmin` + `room` | `{room, identity, track_sid, muted}` |
| `RemoveParticipant` | `roomAdmin` + `room` | `{room, identity}` |
| `DeleteRoom` | `roomCreate` | `{room}` |
| `ListRooms` | `roomList` | `{}` |

- Ответы: snake_case, нулевые значения присутствуют, enum — строками
  (`"CAMERA"`, `"ACTIVE"`), 64-битные числа — строками.
- `ListParticipants` для несуществующей комнаты — 200 и пустой список.
- `MutePublishedTrack` с `muted: false` — 412: сервер не может включить чужой
  микрофон (так и задумано).
- Отказ в правах — 401 `{"code":"unauthenticated"}`.

### Webhook-и
- `Content-Type: application/webhook+json`; `Authorization` — JWT без `Bearer`,
  подписан секретом ключа `webhook.api_key`, живёт 300 с.
- Проверка: подпись JWT, срок, `claims.sha256 === base64(sha256(сырое тело))`.
- Тело: camelCase, **нулевые значения опущены** (нет `numParticipants`, когда 0).
  Формат отличается от ответов API — разбирать раздельно.
- События: `room_started`, `participant_joined`, `track_published`,
  `track_unpublished`, `participant_left`, `room_finished`.
- `participant_joined` приходит на 30–50 мс раньше, чем `connect()` завершится
  у клиента.
- `participant_left`: при обычном закрытии вкладки — сразу; при падении
  вкладки — через ~20 с (`disconnectReason: CONNECTION_TIMEOUT`).
- `room_finished` — через `departure_timeout` после ухода последнего участника.
- В теле есть `turnPassword` — приёмник и `/twirp` наружу не выставлять.

### Клиент
```js
const room = new LK.Room({ adaptiveStream: true, dynacast: true });
await room.connect(url, token /*, { rtcConfig } */);
const cam = await room.localParticipant.publishTrack(videoTrack,
  { source: LK.Track.Source.Camera, simulcast: true });
const mic = await room.localParticipant.publishTrack(audioTrack,
  { source: LK.Track.Source.Microphone });
await cam.track.replaceTrack(otherTrack, { userProvidedTrack: true });
await cam.mute(); await cam.unmute();
await cam.track.pauseUpstream(); await cam.track.resumeUpstream();
await room.localParticipant.publishTrack(screenTrack,
  { source: LK.Track.Source.ScreenShare, simulcast: false });
room.on(LK.RoomEvent.TrackSubscribed, (track) => container.append(track.attach()));
```

- Свой `MediaStreamTrack` SDK не останавливает (`track.isUserProvided`), но
  `mute()` — в том числе с сервера — ставит ему `enabled = false`. Если тот же
  трек питает локальное превью, оно тоже гаснет.
- `pauseUpstream()` перестаёт слать кадры и не трогает `enabled`;
  собеседники видят `TrackMuted`.
- `replaceTrack(null)` бросает исключение. «Ничего не слать» — через `mute()`
  или `pauseUpstream()`.
- При замене трека держать одно разрешение: у собеседников остаётся старое
  `publication.dimensions`, слои simulcast режутся от нового размера.
- Слои simulcast из canvas 1280×720: 320×180, 640×360, 1280×720. Dynacast
  выключает слои, которые никто не смотрит. Слой выбирается по размеру
  элемента, к которому трек прикреплён через `track.attach()`.
- Экран: один поток 1920×1080 до 2,5 Мбит/с.
- Причины `RoomEvent.Disconnected`: `DUPLICATE_IDENTITY` (вход с той же
  identity из другой вкладки), `PARTICIPANT_REMOVED`, `ROOM_DELETED`,
  `SERVER_SHUTDOWN`.
- Остальные при дубле видят только `participantNameChanged`, не выход и вход.

### Прокси и пути
- Клиент запрашивает только `WS /rtc/v1` и `GET /rtc/v1/validate`.
- При проксировании одних `/rtc*` звонок работает полностью, `/twirp` снаружи
  недоступен. В продукте путей на `/rtc` нет.
- Токен едет в строке запроса (`?access_token=`) — в логи доступа он попадать
  не должен.

### TURN
- С записью в `rtc.turn_servers` клиент получает только её
  (`turns:<host>:5349?transport=tcp`), имя `<срок>:<sid участника>`, пароль
  `base64(HMAC-SHA1(secret, имя))`.
- Без записи сервер раздаёт публичные STUN Google и Twilio.

## Риски и выводы для плана

1. **Перезапуск медиасервера.** Один SIGTERM ждёт, пока все выйдут из звонков.
   Два SIGTERM выкидывают всех с `SERVER_SHUTDOWN`, клиенты сами не
   возвращаются. После SIGKILL и быстрого старта клиенты вернулись сами за
   10–16 с, свои треки переопубликовались. В любом варианте старый экземпляр
   не шлёт `participant_left` и `room_finished`.
   Вывод: в systemd — `KillSignal=SIGKILL`; присутствие в приложении не должно
   зависеть от `room_finished`, нужна сверка через `ListParticipants`.
2. **«Убрать из звонка» — мягкое.** Ученик может войти снова с тем же
   токеном. Для версии 1 это принято; настоящий запрет — отдельная задача.
3. **`mute()` меняет наш трек.** Состояние микрофона и камеры в `CallMedia`
   надо синхронизировать с выключением со стороны сервера.
4. **Токен в строке запроса** — отключить логирование `/rtc*` в Caddy.
5. **Бандл 150 КБ gzip** — грузить только при входе в групповой звонок.

## Что не проверено локально

- Safari, iOS, Firefox — был только Chrome.
- Настоящий coturn: сверена только формула пароля.
- Реальная сеть, потери, NAT — всё шло через loopback.
- Больше четырёх участников и нагрузка на сервер.
- Сам Caddy — его заменял прокси на Node.

Это проверялось во второй части — на VPS.

# Вторая часть: проба на VPS (2026-11-22)

Сервер: Ubuntu 24.04, **1 vCPU** (EPYC 7742), 1,9 ГБ памяти, Франкфурт.
Занятий в расписании не было, сокетов приложения за час до работ — ноль.
Приложение не перезапускалось; Caddy перезагружен один раз.

## Что поставлено

- `/usr/local/bin/livekit-server` 1.13.11 (контрольная сумма релиза сверена).
- `/etc/livekit/livekit.yaml` (root:livekit 640): сигналинг только на
  `127.0.0.1:7880`, `rtc.tcp_port: 7881`, `rtc.udp_port: 7882`,
  `use_external_ip: false` (публичный IP на интерфейсе), coturn в
  `rtc.turn_servers` (UDP 3478 и TLS 5349, секрет из
  `/etc/livekit/turn-secret`), одна пара ключей.
- `/etc/systemd/system/livekit.service`: пользователь `livekit`,
  `Restart=always`, `KillSignal=SIGKILL`. Запущен, в автозапуск **не включён**.
- ufw: `7881/tcp`, `7882/udp` (v4 и v6).
- Caddy: в блоке `www.easyclass-edu.ru` — `skip_log /rtc*` и
  `reverse_proxy /rtc* 127.0.0.1:7880`; копия до правки —
  `/etc/caddy/Caddyfile.before-livekit`. В репозитории `deploy/caddy/Caddyfile`
  пока без этих строк.

Откат: `systemctl stop livekit`, вернуть Caddyfile из копии и
`systemctl reload caddy` (после проверки занятий), `ufw delete allow 7881/tcp`,
`ufw delete allow 7882/udp`.

## Итог

| Проверка | Результат |
|---|---|
| Скорость канала | ограничения 100 Мбит/с нет: устойчиво ~600 Мбит/с приём и ~425 отдача до Франкфурта, ~330 Мбит/с с зеркала Яндекса (Москва) на сервер |
| 9 участников, раскладка 3×3 (`lk load-test`) | 162/162 трека, потерь нет; отдача 47 Мбит/с; `livekit-server` ~24% ядра, 170 МБ |
| 9 участников, раскладка «спикер» | отдача 27 Мбит/с; ~19% ядра, 150 МБ |
| Простой | 0,3% ядра, 98 МБ |
| Chrome через Caddy (`wss://www…/rtc`) | вход за 1,1–2,3 с; три участника видят и слышат друг друга |
| Прямое соединение | UDP 7882 (выбран IPv6) |
| Relay через coturn | работает и по UDP 3478, и по TLS 5349; coturn пересылает на свой же IP |
| Перезапуск `systemctl restart livekit` | все вернулись сами за 2–3 с, медиа идёт дальше |
| Токен в логах Caddy | строк с `/rtc` в access-логе нет |
| `/twirp` снаружи | не проходит до LiveKit (405 от приложения) |

## Выводы

1. **Процессор — главный предел.** Одна группа на 9 человек — около
   четверти ядра. Две одновременные группы сервер выдержит, четыре — уже нет
   (плюс приложение, coturn и почта на том же ядре). Если групп станет больше —
   второе ядро или отдельная машина под LiveKit.
2. **Канал с запасом.** С нашей колонкой 340px плитки получают нижний слой
   320×180 (~150 кбит/с на плитку): группа на 9 человек — порядка
   15 Мбит/с отдачи, с показом экрана — ещё до 20 Мбит/с. Замер `lk` с крупными
   плитками — 47 Мбит/с; это верхняя граница.
3. **Фоновые вкладки.** В скрытой вкладке adaptiveStream не берёт видео, а
   браузер тормозит canvas. Для тестов — отдельное окно на участника; для
   продукта — учитывать, что свёрнутая вкладка у ученика перестаёт получать
   видео (это задумано и экономит канал).
4. **UDP-буфер ядра.** LiveKit предупреждает: `rmem_max` 425 КБ, советует
   5 МБ (`net.core.rmem_max`, `net.core.wmem_max`). На 9 участниках потерь не
   было; поднять при деплое (шаг 5).
5. **coturn.** Для relay 49 портов (49152–49200), `total-quota=100`. Участник
   LiveKit через relay занимает одно выделение — на текущие объёмы хватает.

## Что не проверено

- Safari, iOS, Firefox — по-прежнему только Chrome (Chrome на Mac через VPN).
- Отдача сервера в сторону России напрямую: замер шёл до Франкфурта и с
  Москвы на сервер.
- Настоящие камеры и долгий звонок (час и больше) — память росла медленно
  (140 → 177 МБ за минуту нагрузки), за этим посмотреть на шаге 3.
